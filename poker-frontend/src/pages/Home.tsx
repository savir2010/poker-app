import {
  IonContent,
  IonPage,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonButton,
  IonToast,
  IonInput,
  IonItem,
  IonCard,
  IonCardContent,
  IonIcon,
  IonFab,
  IonFabButton,
  createAnimation,
  AnimationBuilder,
  IonText,
  IonImg,
  IonModal,
  IonList,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  IonReorder,
  IonReorderGroup,
  IonAlert,
  ItemReorderEventDetail,
  IonLabel,
  IonRange,
  IonBadge,
  IonGrid,
  IonRow,
  IonCol,
  IonFooter
} from '@ionic/react';
import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  copyOutline, 
  peopleOutline, 
  exitOutline, 
  cashOutline, 
  personAddOutline, 
  cardOutline, 
  playCircleOutline,
  closeCircleOutline,
  swapVerticalOutline,
  personRemoveOutline,
  arrowForwardOutline,
  settingsOutline,
  saveOutline,
  refreshOutline
} from 'ionicons/icons';
import './Home.css';
import { useHistory } from 'react-router-dom';

interface ChipValues {
  white: number;
  red: number;
  blue: number;
  green: number;
  black: number;
}

interface StartingStack {
  white: number;
  red: number;
  blue: number;
  green: number;
  black: number;
}

interface GameSettings {
  chip_values: ChipValues;
  starting_stack: StartingStack;
  small_blind: number;
  big_blind: number;
  max_players: number;
}

const Home: React.FC = () => {
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [partyCode, setPartyCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [isInParty, setIsInParty] = useState(false);
  const [partyMembers, setPartyMembers] = useState<string[]>([]);
  const [username, setUsername] = useState('');
  const [isUsernameEntered, setIsUsernameEntered] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [showCopiedToast, setShowCopiedToast] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showStartGameAlert, setShowStartGameAlert] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [isCountingDown, setIsCountingDown] = useState(false);
  const [countdownAnimClass, setCountdownAnimClass] = useState('');
  const [hostUsername, setHostUsername] = useState('');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [gameSettings, setGameSettings] = useState<GameSettings>({
    chip_values: {
      white: 1,
      red: 5,
      blue: 10,
      green: 25,
      black: 100
    },
    starting_stack: {
      white: 10,
      red: 10,
      blue: 5,
      green: 4,
      black: 2
    },
    small_blind: 5,
    big_blind: 10,
    max_players: 8
  });
  const [editableSettings, setEditableSettings] = useState<GameSettings>({...gameSettings});

  const partyCodeRef = useRef<string>('');
  const socketRef = useRef<Socket | null>(null);
  const codeRef = useRef<HTMLIonInputElement>(null);
  const cardRef = useRef<HTMLIonCardElement>(null);
  const history = useHistory();

  useEffect(() => {
    const savedUsername = localStorage.getItem('pokerUsername');
    if (savedUsername) {
      setUsername(savedUsername);
      setIsUsernameEntered(true);
    }
  }, []);

  useEffect(() => {
    socketRef.current = io('http://127.0.0.1:5050');

    socketRef.current.on('party_update', (data) => {
      setPartyMembers(data.members);
      if (data.message) {
        showToastMessage(data.message);
      }
      playDealCardSound();
    });

    socketRef.current.on('start_game', () => {
      startCountdown();
    });

    socketRef.current.on('player_kicked', (data) => {
      if (data.username === username) {
        showToastMessage('You have been kicked from the party');
        setIsInParty(false);
        setPartyCode('');
        setJoinCode('');
        setPartyMembers([]);
      }
    });
    
    socketRef.current.on('settings_updated', (data) => {
      setGameSettings(data.settings);
      if (data.message) {
        showToastMessage(data.message);
      }
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, [username]);
  
  useEffect(() => {
    if (isInParty && partyCode) {
      fetchGameSettings();
    }
  }, [isInParty, partyCode]);

  useEffect(() => {
    if (cardRef.current && isInParty) {
      const animation = createAnimation()
        .addElement(cardRef.current)
        .duration(800)
        .fromTo('transform', 'scale(0.8) rotateY(-90deg)', 'scale(1) rotateY(0deg)')
        .fromTo('opacity', '0.5', '1');
      
      animation.play();
    }
  }, [isInParty]);
  
  useEffect(() => {
    setEditableSettings({...gameSettings});
  }, [gameSettings]);

  const playDealCardSound = () => {
    const audio = new Audio('/assets/card-deal.mp3');
    audio.volume = 0.5;
    audio.play().catch(e => console.log('Audio play failed', e));
  };

  const playChipSound = () => {
    const audio = new Audio('/assets/chip-sound.mp3');
    audio.volume = 0.5;
    audio.play().catch(e => console.log('Audio play failed', e));
  };

  const submitUsername = () => {
    if (!username.trim()) {
      showToastMessage('Please enter a username');
      return;
    }
    localStorage.setItem('pokerUsername', username);
    setIsUsernameEntered(true);
    playChipSound();
  };

  const createParty = async () => {
    try {
      playChipSound();
      const response = await fetch('http://127.0.0.1:5050/create-party', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username }),
      });

      const data = await response.json();

      if (data.success) {
        setPartyCode(data.code);
        setIsInParty(true);
        setIsHost(true);
        setHostUsername(username);
        setPartyMembers([`${username}`]);
        showToastMessage(`Party created! Your code is: ${data.code}`);
        socketRef.current?.emit('join_room', { code: data.code });
      } else {
        showToastMessage('Failed to create party');
      }
    } catch (error) {
      console.error('Error creating party:', error);
      showToastMessage('Error connecting to server');
    }
  };

  const joinParty = async () => {
    if (!joinCode.trim()) {
      showToastMessage('Please enter a party code');
      return;
    }

    try {
      playChipSound();
      const response = await fetch('http://127.0.0.1:5050/join-party', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: joinCode, username }),
      });

      const data = await response.json();

      if (data.success) {
        setPartyCode(joinCode);
        setIsInParty(true);
        setIsHost(false);
        setHostUsername(data.host || '');
        setPartyMembers(data.members || [username, 'Host']);
        showToastMessage('Successfully joined party!');
        socketRef.current?.emit('join_room', { code: joinCode });
      } else {
        showToastMessage(data.message || 'Failed to join party');
      }
    } catch (error) {
      console.error('Error joining party:', error);
      showToastMessage('Error connecting to server');
    }
  };

  const leaveParty = async () => {
    if (!partyCode) return;

    try {
      playChipSound();
      const response = await fetch('http://127.0.0.1:5050/leave-party', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: partyCode, username: username }),
      });

      const data = await response.json();
      if (data.success) {
        setIsInParty(false);
        setPartyCode('');
        setJoinCode('');
        setPartyMembers([]);
        setIsHost(false);
        setHostUsername('');
        showToastMessage('You left the party');       
      }
    } catch (error) {
      console.error('Error leaving party:', error);
      showToastMessage('Error connecting to server');
    }
  };

  const updatePlayerOrder = async (event: CustomEvent<ItemReorderEventDetail>) => {
    const newOrder = event.detail.complete(partyMembers);
    setPartyMembers(newOrder);
    
    try {
      const response = await fetch('http://127.0.0.1:5050/update-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          code: partyCode, 
          order: newOrder,
          host: hostUsername
        }),
      });

      const data = await response.json();
      if (data.success) {
        showToastMessage('Player order updated');
      }
    } catch (error) {
      console.error('Error updating player order:', error);
      showToastMessage('Error connecting to server');
    }
  };

  const kickPlayer = async (playerName: string) => {
    if (!isHost || playerName === username) return;

    try {
      const response = await fetch('http://127.0.0.1:5050/kick-player', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          code: partyCode, 
          host: username,
          kickedPlayer: playerName 
        }),
      });

      const data = await response.json();
      if (data.success) {
        showToastMessage(`${playerName} has been kicked`);
      } else {
        showToastMessage(data.message || 'Failed to kick player');
      }
    } catch (error) {
      console.error('Error kicking player:', error);
      showToastMessage('Error connecting to server');
    }
  };

  const startGame = async () => {
    if (!isHost) return;

    try {
      const response = await fetch('http://127.0.0.1:5050/start-game', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          code: partyCode, 
          host: username
        }),
      });

      const data = await response.json();
      if (data.success) {
        setShowStartGameAlert(false);
      } else {
        showToastMessage(data.message || 'Failed to start game');
      }
    } catch (error) {
      console.error('Error starting game:', error);
      showToastMessage('Error connecting to server');
    }
  };
  
  const fetchGameSettings = async () => {
    try {
      const response = await fetch(`http://127.0.0.1:5050/get-game-settings/${partyCode}`);
      const data = await response.json();
      if (data.success) {
        setGameSettings(data.settings);
        setEditableSettings({...data.settings});
      } else {
        console.error('Failed to fetch game settings');
      }
    } catch (error) {
      console.error('Error fetching game settings:', error);
    }
  };
  
  const saveGameSettings = async () => {
    if (!isHost) return;
    
    try {
      const response = await fetch('http://127.0.0.1:5050/update-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: partyCode,
          host: username,
          settings: editableSettings
        }),
      });

      const data = await response.json();
      if (data.success) {
        showToastMessage('Game settings updated successfully');
        setShowSettingsModal(false);
        playChipSound();
      } else {
        showToastMessage(data.message || 'Failed to update settings');
      }
    } catch (error) {
      console.error('Error updating game settings:', error);
      showToastMessage('Error connecting to server');
    }
  };
  
  const calculateTotalStackValue = (stack: StartingStack, values: ChipValues): number => {
    return (
      stack.white * values.white +
      stack.red * values.red +
      stack.blue * values.blue +
      stack.green * values.green +
      stack.black * values.black
    );
  };
  
  const handleChipStackChange = (color: keyof StartingStack, value: number) => {
    setEditableSettings({
      ...editableSettings,
      starting_stack: {
        ...editableSettings.starting_stack,
        [color]: value
      }
    });
  };
  
  const handleChipValueChange = (color: keyof ChipValues, value: number) => {
    setEditableSettings({
      ...editableSettings,
      chip_values: {
        ...editableSettings.chip_values,
        [color]: value
      }
    });
  };
  
  const resetSettingsForm = () => {
    setEditableSettings({...gameSettings});
    playChipSound();
  };
  
  useEffect(() => {
    partyCodeRef.current = partyCode;
  }, [partyCode]);
  
  const startCountdown = () => {
    setIsCountingDown(true);
    setCountdown(3);
    setCountdownAnimClass('countdown-anim');
    
    const countInterval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countInterval);
          setTimeout(() => {
            if (partyCodeRef.current) {
              localStorage.setItem('pokerUsername', username);
              history.push(`/game/${partyCodeRef.current}`);
            } else {
              showToastMessage("Error: Could not find party code");
            }
          }, 1000);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);    
  };

  const showToastMessage = (message: string) => {
    setToastMessage(message);
    setShowToast(true);
  };

  const resetUsername = () => {
    setIsUsernameEntered(false);
    setUsername('');
    playChipSound();
  };

  const copyCodeToClipboard = () => {
    navigator.clipboard.writeText(partyCode);
    setShowCopiedToast(true);
    playChipSound();
  };

  const renderSettingsModal = () => {
    return (
      <IonModal isOpen={showSettingsModal} onDidDismiss={() => setShowSettingsModal(false)} className="settings-modal">
        <IonHeader>
          <IonToolbar className="app-toolbar">
            <IonTitle>Game Settings</IonTitle>
            <IonButton slot="end" fill="clear" onClick={() => setShowSettingsModal(false)}>
              <IonIcon icon={closeCircleOutline} />
            </IonButton>
          </IonToolbar>
        </IonHeader>
        
        <IonContent className="settings-content">
          {isHost ? (
            <div className="settings-container">
              <div className="settings-section">
                <h2 className="settings-heading">Blind Settings</h2>
                <IonItem className="settings-item">
                  <IonLabel position="stacked">Small Blind</IonLabel>
                  <IonInput
                    type="number"
                    min="1"
                    value={editableSettings.small_blind}
                    onIonChange={(e) => setEditableSettings({
                      ...editableSettings,
                      small_blind: parseInt(e.detail.value || '1', 10)
                    })}
                  />
                </IonItem>
                
                <IonItem className="settings-item">
                  <IonLabel position="stacked">Big Blind</IonLabel>
                  <IonInput
                    type="number"
                    min={editableSettings.small_blind}
                    value={editableSettings.big_blind} 
                    onIonChange={(e) => setEditableSettings({
                      ...editableSettings,
                      big_blind: parseInt(e.detail.value || '2', 10)
                    })}
                  />
                </IonItem>
              </div>
              
              <div className="settings-section">
                <h2 className="settings-heading">Players</h2>
                <IonItem className="settings-item">
                  <IonLabel position="stacked">Maximum Players</IonLabel>
                  <IonRange
                    min={2}
                    max={10}
                    pin={true}
                    value={editableSettings.max_players}
                    onIonChange={(e) => setEditableSettings({
                      ...editableSettings,
                      max_players: e.detail.value as number
                    })}
                  >
                    <IonLabel slot="start">2</IonLabel>
                    <IonLabel slot="end">10</IonLabel>
                  </IonRange>
                  <IonBadge slot="end" color="primary" className="players-badge">
                    {editableSettings.max_players}
                  </IonBadge>
                </IonItem>
              </div>
              
              <div className="settings-section">
                <h2 className="settings-heading">Chip Values</h2>
                <IonGrid className="chip-grid">
                  <IonRow className="chip-values-header">
                    <IonCol size="4" className="chip-header">Chip Color</IonCol>
                    <IonCol size="4" className="chip-header">Value</IonCol>
                    <IonCol size="4" className="chip-header">Starting Qty</IonCol>
                  </IonRow>
                  
                  {/* White Chips */}
                  <IonRow className="chip-row">
                    <IonCol size="4" className="chip-color white-chip">
                      <div className="chip-icon"></div>
                      White
                    </IonCol>
                    <IonCol size="4">
                      <IonInput
                        type="number"
                        min="1"
                        value={editableSettings.chip_values.white}
                        onIonChange={(e) => handleChipValueChange('white', parseInt(e.detail.value || '1', 10))}
                        className="chip-input"
                      />
                    </IonCol>
                    <IonCol size="4">
                      <IonInput
                        type="number"
                        min="0"
                        value={editableSettings.starting_stack.white}
                        onIonChange={(e) => handleChipStackChange('white', parseInt(e.detail.value || '0', 10))}
                        className="chip-input"
                      />
                    </IonCol>
                  </IonRow>
                  
                  {/* Red Chips */}
                  <IonRow className="chip-row">
                    <IonCol size="4" className="chip-color red-chip">
                      <div className="chip-icon"></div>
                      Red
                    </IonCol>
                    <IonCol size="4">
                      <IonInput
                        type="number"
                        min="1"
                        value={editableSettings.chip_values.red}
                        onIonChange={(e) => handleChipValueChange('red', parseInt(e.detail.value || '5', 10))}
                        className="chip-input"
                      />
                    </IonCol>
                    <IonCol size="4">
                      <IonInput
                        type="number"
                        min="0"
                        value={editableSettings.starting_stack.red}
                        onIonChange={(e) => handleChipStackChange('red', parseInt(e.detail.value || '0', 10))}
                        className="chip-input"
                      />
                    </IonCol>
                  </IonRow>
                  
                  {/* Blue Chips */}
                  <IonRow className="chip-row">
                    <IonCol size="4" className="chip-color blue-chip">
                      <div className="chip-icon"></div>
                      Blue
                    </IonCol>
                    <IonCol size="4">
                      <IonInput
                        type="number"
                        min="1"
                        value={editableSettings.chip_values.blue}
                        onIonChange={(e) => handleChipValueChange('blue', parseInt(e.detail.value || '10', 10))}
                        className="chip-input"
                      />
                    </IonCol>
                    <IonCol size="4">
                      <IonInput
                        type="number"
                        min="0"
                        value={editableSettings.starting_stack.blue}
                        onIonChange={(e) => handleChipStackChange('blue', parseInt(e.detail.value || '0', 10))}
                        className="chip-input"
                      />
                    </IonCol>
                  </IonRow>
                  
                  {/* Green Chips */}
                  <IonRow className="chip-row">
                    <IonCol size="4" className="chip-color green-chip">
                      <div className="chip-icon"></div>
                      Green
                    </IonCol>
                    <IonCol size="4">
                      <IonInput
                        type="number"
                        min="1"
                        value={editableSettings.chip_values.green}
                        onIonChange={(e) => handleChipValueChange('green', parseInt(e.detail.value || '25', 10))}
                        className="chip-input"
                      />
                    </IonCol>
                    <IonCol size="4">
                      <IonInput
                        type="number"
                        min="0"
                        value={editableSettings.starting_stack.green}
                        onIonChange={(e) => handleChipStackChange('green', parseInt(e.detail.value || '0', 10))}
                        className="chip-input"
                      />
                    </IonCol>
                  </IonRow>
                  
                  {/* Black Chips */}
                  <IonRow className="chip-row">
                    <IonCol size="4" className="chip-color black-chip">
                      <div className="chip-icon"></div>
                      Black
                    </IonCol>
                    <IonCol size="4">
                      <IonInput
                        type="number"
                        min="1"
                        value={editableSettings.chip_values.black}
                        onIonChange={(e) => handleChipValueChange('black', parseInt(e.detail.value || '100', 10))}
                        className="chip-input"
                      />
                    </IonCol>
                    <IonCol size="4">
                      <IonInput
                        type="number"
                        min="0"
                        value={editableSettings.starting_stack.black}
                        onIonChange={(e) => handleChipStackChange('black', parseInt(e.detail.value || '0', 10))}
                        className="chip-input"
                      />
                    </IonCol>
                  </IonRow>
                </IonGrid>
                
                <div className="stack-summary">
                  <p className="stack-total">
                    Starting Stack Value: 
                    <span className="total-value">
                      ${calculateTotalStackValue(
                        editableSettings.starting_stack, 
                        editableSettings.chip_values
                      )}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="settings-container view-only">
              <div className="view-only-message">
                {/* <IonIcon icon={settingsOutline} className="view-icon" /> */}
                <p>Only the host can modify game settings</p>
              </div>
              
              <div className="settings-section">
                <h2 className="settings-heading">Game Configuration</h2>
                <IonList lines="full" className="settings-list">
                  <IonItem className="settings-item">
                    <IonLabel>Small Blind</IonLabel>
                    <IonText slot="end">${gameSettings.small_blind}</IonText>
                  </IonItem>
                  <IonItem className="settings-item">
                    <IonLabel>Big Blind</IonLabel>
                    <IonText slot="end">${gameSettings.big_blind}</IonText>
                  </IonItem>
                  <IonItem className="settings-item">
                    <IonLabel>Maximum Players</IonLabel>
                    <IonText slot="end">{gameSettings.max_players}</IonText>
                  </IonItem>
                </IonList>
              </div>
              
              <div className="settings-section">
                <h2 className="settings-heading">Chip Values & Starting Stack</h2>
                <IonGrid className="chip-grid">
                  <IonRow className="chip-values-header">
                    <IonCol size="4" className="chip-header">Chip Color</IonCol>
                    <IonCol size="4" className="chip-header">Value</IonCol>
                    <IonCol size="4" className="chip-header">Starting Qty</IonCol>
                  </IonRow>
                  
                  {/* White Chips */}
                  <IonRow className="chip-row">
                    <IonCol size="4" className="chip-color white-chip">
                      <div className="chip-icon"></div>
                      White
                    </IonCol>
                    <IonCol size="4">${gameSettings.chip_values.white}</IonCol>
                    <IonCol size="4">{gameSettings.starting_stack.white}</IonCol>
                  </IonRow>
                  
                  {/* Red Chips */}
                  <IonRow className="chip-row">
                    <IonCol size="4" className="chip-color red-chip">
                      <div className="chip-icon"></div>
                      Red
                    </IonCol>
                    <IonCol size="4">${gameSettings.chip_values.red}</IonCol>
                    <IonCol size="4">{gameSettings.starting_stack.red}</IonCol>
                  </IonRow>
                  
                  {/* Blue Chips */}
                  <IonRow className="chip-row">
                    <IonCol size="4" className="chip-color blue-chip">
                      <div className="chip-icon"></div>
                      Blue
                    </IonCol>
                    <IonCol size="4">${gameSettings.chip_values.blue}</IonCol>
                    <IonCol size="4">{gameSettings.starting_stack.blue}</IonCol>
                  </IonRow>
                  
                  {/* Green Chips */}
                  <IonRow className="chip-row">
                    <IonCol size="4" className="chip-color green-chip">
                      <div className="chip-icon"></div>
                      Green
                    </IonCol>
                    <IonCol size="4">${gameSettings.chip_values.green}</IonCol>
                    <IonCol size="4">{gameSettings.starting_stack.green}</IonCol>
                  </IonRow>
                  
                  {/* Black Chips */}
                  <IonRow className="chip-row">
                    <IonCol size="4" className="chip-color black-chip">
                      <div className="chip-icon"></div>
                      Black
                    </IonCol>
                    <IonCol size="4">${gameSettings.chip_values.black}</IonCol>
                    <IonCol size="4">{gameSettings.starting_stack.black}</IonCol>
                  </IonRow>
                </IonGrid>
                
                <div className="stack-summary">
                  <p className="stack-total">
                    Starting Stack Value: 
                    <span className="total-value">
                      ${calculateTotalStackValue(
                        gameSettings.starting_stack, 
                        gameSettings.chip_values
                      )}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          )}
        </IonContent>
        
        {isHost && (
          <IonFooter>
            <div className="settings-actions">
              <IonButton fill="outline" onClick={resetSettingsForm}>
                <IonIcon slot="start" icon={refreshOutline} />
                Reset
              </IonButton>
              <IonButton onClick={saveGameSettings}>
                <IonIcon slot="start" icon={saveOutline} />
                Save Settings
              </IonButton>
            </div>
          </IonFooter>
        )}
      </IonModal>
    );
  };

  return (
    <IonPage className="poker-app">
      <IonHeader>
        <IonToolbar className="app-toolbar">
          <IonTitle className="app-title">
            <IonIcon icon={cashOutline} className="title-icon" /> Poker Night
          </IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding poker-content">
        <div className="animated-background"></div>
        
        {/* Countdown overlay */}
        {isCountingDown && (
          <div className="countdown-overlay">
            <div className={`countdown-number ${countdownAnimClass}`}>
              {countdown > 0 ? countdown : 'GO!'}
            </div>
          </div>
        )}
        
        {!isUsernameEntered ? (
          <IonCard className="welcome-card">
            <div className="card-shine"></div>
            <IonCardContent>
              <div className="logo-container">
                <div className="logo">
                  <IonIcon icon={cardOutline} className="logo-icon pulse" />
                </div>
              </div>
              <h2 className="welcome-title">Welcome to Poker Night</h2>
              <p className="welcome-text">Enter your username to join the action</p>
              <IonItem className="username-input">
                <IonInput
                  value={username}
                  onIonChange={(e) => setUsername(e.detail.value || '')}
                  placeholder="Enter your username"
                  className="custom-input"
                />
              </IonItem>
              <IonButton 
                expand="block" 
                className="continue-btn"
                onClick={submitUsername}
              >
                Continue
              </IonButton>
            </IonCardContent>
          </IonCard>
        ) : !isInParty ? (
          <div className="party-options-container">
            <div className="username-display">
              <p className="logged-as">Logged in as: <strong>{username}</strong> 
                <IonButton size="small" fill="clear" className="change-btn" onClick={resetUsername}>
                  Change
                </IonButton>
              </p>
            </div>

            <IonCard className="option-card create-card">
              <div className="card-shine"></div>
              <IonCardContent>
                <div className="option-icon">
                  <IonIcon icon={personAddOutline} />
                </div>
                <h3 className="option-title">Create a New Party</h3>
                <p className="option-text">Create a table and invite your friends</p>
                <IonButton expand="block" className="action-btn create-btn" onClick={createParty}>
                  Create Party
                </IonButton>
              </IonCardContent>
            </IonCard>

            <IonCard className="option-card join-card">
              <div className="card-shine"></div>
              <IonCardContent>
                <div className="option-icon">
                  <IonIcon icon={peopleOutline} />
                </div>
                <h3 className="option-title">Join Existing Party</h3>
                <IonItem className="code-input">
                  <IonInput
                    value={joinCode}
                    onIonChange={(e) => setJoinCode(e.detail.value || '')}
                    placeholder="Enter party code"
                    className="custom-input"
                  />
                </IonItem>
                <IonButton
                  expand="block"
                  className="action-btn join-btn"
                  onClick={joinParty}
                >
                  Join Party
                </IonButton>
              </IonCardContent>
            </IonCard>
          </div>
        ) : (
        <IonCard className="party-card" ref={cardRef}>
          <div className="card-shine"></div>
          <IonCardContent>
            {/* Card Header with Settings Icon */}
            <div className="party-card-header">
              <div className={`party-status ${isHost ? 'host-status' : ''}`}>
                <h2 className="party-title">
                  {isHost ? (
                    <>
                      You're Hosting
                      <span className="host-badge">HOST</span>
                    </>
                  ) : (
                    'You\'re at the Table'
                  )}
                </h2>
              </div>
              <IonButton 
                fill="clear" 
                onClick={() => setShowSettingsModal(true)}
                className="settings-btn"
              >
                <IonIcon icon={settingsOutline} slot="icon-only" />
              </IonButton>
            </div>
            
            {/* Party Code Section */}
            <div className="party-code-container">
              <p className="party-code-label">Party Code:</p>
              <div className="party-code-display">
                <span className="party-code">{partyCode}</span>
                <IonButton 
                  fill="clear" 
                  className="copy-btn" 
                  onClick={copyCodeToClipboard}
                >
                  <IonIcon icon={copyOutline} slot="icon-only" />
                </IonButton>
              </div>
            </div>
            
            {/* Members List Section */}
            <div className="members-container">
              <div className="members-header">
                <h3 className="members-title">
                  <IonIcon icon={peopleOutline} className="members-icon" />
                  Players at the Table:
                </h3>
                {isHost && (
                  <IonButton 
                    fill="clear" 
                    size="small" 
                    className="order-btn"
                    onClick={() => setShowOrderModal(true)}
                  >
                    <IonIcon icon={swapVerticalOutline} slot="icon-only" />
                  </IonButton>
                )}
              </div>
              
              <ul className="members-list">
                {partyMembers.map((member, index) => (
                  <li key={index} className="member-item">
                    <div className="member-avatar">
                      {member.charAt(0).toUpperCase()}
                    </div>
                    <span className="member-name">{member}</span>
                    {isHost && member !== username && (
                      <IonButton 
                        fill="clear" 
                        size="small" 
                        className="kick-btn"
                        onClick={() => kickPlayer(member)}
                      >
                        <IonIcon icon={personRemoveOutline} color="danger" slot="icon-only" />
                      </IonButton>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            
            {/* Action Buttons */}
            <div className="party-actions">
              {isHost && (
                <IonButton 
                  expand="block" 
                  color="success" 
                  className="start-btn"
                  onClick={() => setShowStartGameAlert(true)}
                >
                  <IonIcon icon={playCircleOutline} slot="start" />
                  Start Game
                </IonButton>
              )}
              
              <IonButton 
                expand="block" 
                color="danger" 
                className="leave-btn" 
                onClick={leaveParty}
              >
                <IonIcon icon={exitOutline} slot="start" />
                Leave Table
              </IonButton>
            </div>
          </IonCardContent>
        </IonCard>
        )}
        
        {/* Username Modal */}
        {/* Order Players Modal */}
        <IonModal isOpen={showOrderModal} onDidDismiss={() => setShowOrderModal(false)} className="order-modal">
          <IonHeader>
            <IonToolbar>
              <IonTitle>Arrange Players</IonTitle>
              <IonButton slot="end" onClick={() => setShowOrderModal(false)}>Close</IonButton>
            </IonToolbar>
          </IonHeader>
          <IonContent>
            <p className="order-instructions">
              Drag to reorder players. This will set the play order for the game.
            </p>
            <IonReorderGroup disabled={false} onIonItemReorder={updatePlayerOrder}>
              {partyMembers.map((member, index) => (
                <IonItem key={index}>
                  <div className="member-avatar order-avatar">{member.charAt(0).toUpperCase()}</div>
                  <IonText className="order-name">{member}</IonText>
                  {member === hostUsername && <span className="host-indicator">Host</span>}
                  <IonReorder slot="end">
                    <IonIcon icon={swapVerticalOutline} />
                  </IonReorder>
                </IonItem>
              ))}
            </IonReorderGroup>
          </IonContent>
        </IonModal>

        {/* Settings Modal */}
        {renderSettingsModal()}

        {/* Start Game Confirmation Alert */}
        <IonAlert
          isOpen={showStartGameAlert}
          onDidDismiss={() => setShowStartGameAlert(false)}
          header="Ready to Play?"
          message="Are you sure you want to start the game? All players will be redirected to the game table."
          buttons={[
            {
              text: 'Cancel',
              role: 'cancel',
              handler: () => setShowStartGameAlert(false)
            },
            {
              text: 'Start Game',
              handler: () => {
                setShowStartGameAlert(false);
                startGame();
              }
            }
          ]}
        />

        <IonToast
          isOpen={showToast}
          message={toastMessage}
          duration={3000}
          onDidDismiss={() => setShowToast(false)}
          className="custom-toast"
        />
        
        <IonToast
          isOpen={showCopiedToast}
          message="Code copied to clipboard!"
          duration={2000}
          onDidDismiss={() => setShowCopiedToast(false)}
          className="custom-toast"
        />
      </IonContent>
    </IonPage>
  );
};

export default Home;