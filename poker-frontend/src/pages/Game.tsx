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
  IonToast
} from '@ionic/react';
import { useState, useEffect } from 'react';
import { useParams, useHistory } from 'react-router-dom';
import { arrowBackOutline, personOutline, playForwardOutline } from 'ionicons/icons';
import { io, Socket } from 'socket.io-client';
import './Game.css'; // You may need to create this CSS file

interface ParamTypes {
  id: string;
}

const Game: React.FC = () => {
  const { id } = useParams<ParamTypes>();
  const history = useHistory();
  const [players, setPlayers] = useState<string[]>([]);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState<string>('');
  const [isHost, setIsHost] = useState(false);
  const [hostUsername, setHostUsername] = useState('');
  const [toast, setToast] = useState({
    isOpen: false,
    message: '',
    color: 'success'
  });
  const [isAdvancingTurn, setIsAdvancingTurn] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    // Get username from localStorage (set during login in Home.tsx)
    const storedUsername = localStorage.getItem('pokerUsername');
    if (storedUsername) {
      setUsername(storedUsername);
    } else {
      // If no username is found, redirect back to home
      setError('User not found');
      setTimeout(() => history.push('/'), 2000);
      return;
    }

    // Initialize socket connection
    const socketInstance = io('http://127.0.0.1:5050');
    setSocket(socketInstance);
    
    // Join the room with the party code
    socketInstance.emit('join_room', { code: id });
    
    // Listen for socket events
    socketInstance.on('turn_update', (data) => {
      setCurrentTurn(data.currentTurn);
      setToast({
        isOpen: true,
        message: `Turn advanced to ${data.currentPlayer}`,
        color: 'success'
      });
    });
    
    socketInstance.on('party_update', (data) => {
      setPlayers(data.members);
      setToast({
        isOpen: true,
        message: data.message,
        color: 'info'
      });
    });
    
    socketInstance.on('player_kicked', (data) => {
      if (data.username === storedUsername) {
        setToast({
          isOpen: true,
          message: 'You have been kicked from the game',
          color: 'danger'
        });
        setTimeout(() => history.push('/'), 2000);
      }
    });

    // Fetch game data
    const fetchGameData = async () => {
      try {
        const response = await fetch(`http://127.0.0.1:5050/get-game-data/${id}`);
        const data = await response.json();
        
        if (data.success) {
          setPlayers(data.players);
          setCurrentTurn(data.currentTurn || 0);
          setHostUsername(data.host || '');
          setIsHost(data.host === storedUsername);
        } else {
          setError('Game not found');
          setTimeout(() => history.push('/'), 3000);
        }
      } catch (err) {
        setError('Connection error');
      }
    };

    fetchGameData();
    
    // Cleanup function
    return () => {
      socketInstance.disconnect();
    };
    
  }, [id, history]);

  const leaveGame = async () => {
    try {
      const response = await fetch('http://127.0.0.1:5050/leave-party', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: id, username }),
      });

      const data = await response.json();
      if (data.success) {
        history.push('/');
      }
    } catch (error) {
      console.error('Error leaving game:', error);
    }
  };
  
  const advanceTurn = async () => {
    setIsAdvancingTurn(true);
    try {
      const response = await fetch('http://127.0.0.1:5050/advance-turn', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: id, username }),
      });

      const data = await response.json();
      if (!data.success) {
        setToast({
          isOpen: true,
          message: data.message || 'Failed to advance turn',
          color: 'danger'
        });
      }
    } catch (error) {
      console.error('Error advancing turn:', error);
      setToast({
        isOpen: true,
        message: 'Network error occurred',
        color: 'danger'
      });
    } finally {
      setIsAdvancingTurn(false);
    }
  };

  // Check if it's the current user's turn
  const isCurrentUserTurn = players[currentTurn] === username;

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
                {isCurrentUserTurn ? "End Your Turn" : `Waiting for ${players[currentTurn] || "..."}'s turn`}
              </IonButton>
            </div>
          </IonCardContent>
        </IonCard>
        
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