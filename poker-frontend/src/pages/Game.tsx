import {
  IonContent,
  IonPage,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonCard,
  IonCardContent,
  IonList,
  IonItem,
  IonLabel,
  IonBadge,
  IonButton,
  IonIcon,
  IonAvatar,
  IonText,
  IonToast,
  IonLoading
} from '@ionic/react';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useHistory } from 'react-router-dom';
import { arrowBackOutline, playForwardOutline } from 'ionicons/icons';
import { io, Socket } from 'socket.io-client';
import './Game.css';

// Define API endpoint as a constant to avoid repetition
const API_URL = 'http://127.0.0.1:5050';

// Define interfaces for better type safety
interface ParamTypes {
  id: string;
}

interface ToastState {
  isOpen: boolean;
  message: string;
  color: 'success' | 'danger' | 'warning' | 'info';
}

interface GameState {
  players: string[];
  currentTurn: number;
  error: string | null;
  username: string;
  isHost: boolean;
  hostUsername: string;
  isAdvancingTurn: boolean;
  loading: boolean;
}

const Game: React.FC = () => {
  const { id } = useParams<ParamTypes>();
  const history = useHistory();
  
  // Game state
  const [gameState, setGameState] = useState<GameState>({
    players: [],
    currentTurn: 0,
    error: null,
    username: '',
    isHost: false,
    hostUsername: '',
    isAdvancingTurn: false,
    loading: true
  });
  
  // Toast notifications
  const [toast, setToast] = useState<ToastState>({
    isOpen: false,
    message: '',
    color: 'success'
  });
  
  // Socket connection
  const [socket, setSocket] = useState<Socket | null>(null);

  // Extract properties from gameState for cleaner code
  const { 
    players, 
    currentTurn, 
    error, 
    username, 
    isHost, 
    hostUsername, 
    isAdvancingTurn,
    loading
  } = gameState;

  // Check if it's the current user's turn
  const isCurrentUserTurn = players[currentTurn] === username;

  // Show toast notification
  const showToast = useCallback((message: string, color: ToastState['color'] = 'success') => {
    setToast({
      isOpen: true,
      message,
      color
    });
  }, []);

  // Handle server errors gracefully
  const handleError = useCallback((message: string) => {
    setGameState(prevState => ({
      ...prevState,
      error: message
    }));
    showToast(message, 'danger');
  }, [showToast]);

  // Handle game data updates
  const updateGameState = useCallback((data: any) => {
    if (data.success) {
      setGameState(prevState => ({
        ...prevState,
        players: data.players || [],
        currentTurn: data.currentTurn ?? 0,
        hostUsername: data.host || '',
        isHost: data.host === prevState.username,
        loading: false
      }));
    } else {
      handleError(data.message || 'Game not found');
      setTimeout(() => history.push('/'), 3000);
    }
  }, [handleError, history]);

  // Leave the game
  const leaveGame = async () => {
    try {
      const response = await fetch(`${API_URL}/leave-party`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: id, username }),
      });

      const data = await response.json();
      if (data.success) {
        history.push('/');
      } else {
        showToast(data.message || 'Failed to leave game', 'danger');
      }
    } catch (error) {
      console.error('Error leaving game:', error);
      showToast('Network error occurred', 'danger');
    }
  };
  
  // Advance turn
  const advanceTurn = async () => {
    if (!isCurrentUserTurn || isAdvancingTurn) return;
    
    setGameState(prevState => ({
      ...prevState,
      isAdvancingTurn: true
    }));
    
    try {
      const response = await fetch(`${API_URL}/advance-turn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: id, username }),
      });

      const data = await response.json();
      if (!data.success) {
        showToast(data.message || 'Failed to advance turn', 'danger');
      }
    } catch (error) {
      console.error('Error advancing turn:', error);
      showToast('Network error occurred', 'danger');
    } finally {
      setGameState(prevState => ({
        ...prevState,
        isAdvancingTurn: false
      }));
    }
  };

  // Setup socket listeners
  const setupSocketListeners = useCallback((socketInstance: Socket) => {
    socketInstance.on('turn_update', (data) => {
      setGameState(prevState => ({
        ...prevState,
        currentTurn: data.currentTurn
      }));
      showToast(`Turn advanced to ${data.currentPlayer}`, 'success');
    });
    
    socketInstance.on('party_update', (data) => {
      setGameState(prevState => ({
        ...prevState,
        players: data.members || prevState.players
      }));
      showToast(data.message, 'info');
    });
    
    socketInstance.on('player_kicked', (data) => {
      if (data.username === username) {
        showToast('You have been kicked from the game', 'danger');
        setTimeout(() => history.push('/'), 2000);
      }
    });

    // Listen for game start
    socketInstance.on('start_game', () => {
      showToast('Game has started!', 'success');
      
      // Refresh game data after game start
      fetchGameData();
    });
    
    // Error handling
    socketInstance.on('connect_error', () => {
      handleError('Connection to game server failed');
    });
    
    socketInstance.on('error', (err: any) => {
      handleError(`Socket error: ${err.message || 'Unknown error'}`);
    });
  }, [username, history, showToast, handleError]);

  // Fetch game data from server
  const fetchGameData = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/get-game-data/${id}`);
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      const data = await response.json();
      
      // Extract player usernames from the player objects
      if (data.success && data.players) {
        const playerUsernames = Array.isArray(data.players) 
          ? data.players.map((p: any) => p.username || p)
          : [];
        
        updateGameState({
          ...data,
          players: playerUsernames
        });
      } else {
        handleError(data.message || 'Game data could not be loaded');
      }
    } catch (err) {
      handleError('Connection error');
      console.error('Error fetching game data:', err);
    }
  }, [id, updateGameState, handleError]);

  // Initialize component
  useEffect(() => {
    // Get username from localStorage
    const storedUsername = localStorage.getItem('pokerUsername');
    if (storedUsername) {
      setGameState(prevState => ({
        ...prevState,
        username: storedUsername
      }));
    } else {
      // If no username is found, redirect back to home
      handleError('User not found');
      setTimeout(() => history.push('/'), 2000);
      return;
    }

    // Initialize socket connection
    const socketInstance = io(API_URL, {
      reconnectionAttempts: 5,
      timeout: 10000,
      transports: ['websocket', 'polling']
    });
    
    setSocket(socketInstance);
    
    // Join the room with the party code
    socketInstance.emit('join_room', { code: id });
    
    // Setup socket event listeners
    setupSocketListeners(socketInstance);

    // Fetch initial game data
    fetchGameData();
    
    // Cleanup function
    return () => {
      socketInstance.disconnect();
    };
  }, [id, history, setupSocketListeners, fetchGameData, handleError]);

  // Display error state
  if (error) {
    return (
      <IonPage>
        <IonHeader>
          <IonToolbar>
            <IonTitle>Error</IonTitle>
          </IonToolbar>
        </IonHeader>
        <IonContent className="ion-padding">
          <IonCard>
            <IonCardContent>
              <h2 style={{ color: '#ef4444' }}>{error}</h2>
              <p>Redirecting to home...</p>
            </IonCardContent>
          </IonCard>
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage className="game-page">
      <IonHeader>
        <IonToolbar>
          <IonButton slot="start" fill="clear" onClick={leaveGame}>
            <IonIcon icon={arrowBackOutline} />
          </IonButton>
          <IonTitle>Poker Table: {id}</IonTitle>
        </IonToolbar>
      </IonHeader>
      
      <IonContent className="ion-padding">
        <div className="animated-background"></div>
        
        <IonLoading isOpen={loading} message="Loading game..." />
        
        {!loading && (
          <IonCard className="player-info-card">
            <IonCardContent>
              <div className="current-user">
                <h2>You are playing as: <strong>{username}</strong></h2>
                {isHost && <IonBadge color="warning">Host</IonBadge>}
              </div>
              
              <h3 className="section-title">Players at the Table</h3>
              <IonList className="player-list">
                {players.map((player, index) => (
                  <IonItem key={index} className={player === username ? 'current-player' : ''}>
                    <IonAvatar slot="start" className="player-avatar">
                      <div className="avatar-text">{player.charAt(0).toUpperCase()}</div>
                    </IonAvatar>
                    
                    <IonLabel>
                      <h2>
                        {player}
                        {player === username && <span className="you-indicator"> (You)</span>}
                      </h2>
                      {player === hostUsername && <IonText color="warning">Host</IonText>}
                    </IonLabel>
                    
                    {index === currentTurn && (
                      <IonBadge color="success" slot="end">
                        Current Turn
                      </IonBadge>
                    )}
                  </IonItem>
                ))}
              </IonList>
              
              {/* Game controls */}
              <div className="game-controls ion-padding-top">
                <IonButton 
                  expand="block" 
                  color={isCurrentUserTurn ? "primary" : "medium"}
                  onClick={advanceTurn}
                  disabled={!isCurrentUserTurn || isAdvancingTurn}
                  className="advance-turn-button"
                >
                  <IonIcon slot="start" icon={playForwardOutline} />
                  {isCurrentUserTurn 
                    ? "End Your Turn" 
                    : `Waiting for ${players[currentTurn] || "..."}'s turn`}
                </IonButton>
              </div>
            </IonCardContent>
          </IonCard>
        )}
        
        <IonToast
          isOpen={toast.isOpen}
          onDidDismiss={() => setToast({...toast, isOpen: false})}
          message={toast.message}
          duration={2000}
          color={toast.color}
        />
      </IonContent>
    </IonPage>
  );
};

export default Game;