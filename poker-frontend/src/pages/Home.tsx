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
  ItemReorderEventDetail
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
  arrowForwardOutline
} from 'ionicons/icons';
import './Home.css';
import { useHistory } from 'react-router-dom';

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
  const [hostUsername, setHostUsername] = useState(''); // Added to track the host separately
  const partyCodeRef = useRef<string>(''); // Create a ref to store partyCode
  const socketRef = useRef<Socket | null>(null);
  const codeRef = useRef<HTMLIonInputElement>(null);
  const cardRef = useRef<HTMLIonCardElement>(null);
  const history = useHistory();

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

    return () => {
      socketRef.current?.disconnect();
    };
  }, [username]);

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
        setHostUsername(username); // Set the host username
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
        setHostUsername(data.host || ''); // Set the host username from response
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
    // Complete the reorder and update the items
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
          host: hostUsername // Send host username to ensure they remain host
        }),
      });

      const data = await response.json();
      if (data.success) {
        showToastMessage('Player order updated');
        // The socketio update will update for everyone
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
        // Socket.io will update the member list for everyone
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
        // The server will emit a socket.io event to all clients to start the game
        // startCountdown() will be called by the socket listener
      } else {
        showToastMessage(data.message || 'Failed to start game');
      }
    } catch (error) {
      console.error('Error starting game:', error);
      showToastMessage('Error connecting to server');
    }
  };
  useEffect(() => {
    partyCodeRef.current = partyCode; // Keep ref in sync with state
  }, [partyCode]);
  const startCountdown = () => {
    setIsCountingDown(true);
    setCountdown(3);
    setCountdownAnimClass('countdown-anim');
    
    // Store partyCode in a constant to ensure it's captured in the closure
    const currentPartyCode = partyCode;
    console.log("Starting countdown with party code:", hostUsername);
    
    const countInterval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countInterval);
          setTimeout(() => {
            // Navigate to game page after countdown with the correct party code
            if (partyCodeRef.current) {
              console.log("Navigating to game with code:", partyCodeRef.current);
              // Make sure we've stored the username in localStorage before navigating
              localStorage.setItem('pokerUsername', username);
              history.push(`/game/${partyCodeRef.current}`);
            } else {
              console.error("No party code available for navigation");
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
              <div className={`party-status ${isHost ? 'host-status' : ''}`}>
                <h2 className="party-title">
                  {isHost ? (
                    <>You're Hosting<span className="host-badge">HOST</span></>
                  ) : (
                    <>You're at the Table</>
                  )}
                </h2>
              </div>
              
              <div className="party-code-container">
                <p className="party-code-label">Party Code:</p>
                <div className="party-code-display">
                  <span className="party-code">{partyCode}</span>
                  <IonButton fill="clear" className="copy-btn" onClick={copyCodeToClipboard}>
                    <IonIcon icon={copyOutline} />
                  </IonButton>
                </div>
              </div>
              
              <div className="members-container">
                <div className="members-header">
                  <h3 className="members-title">
                    <IonIcon icon={peopleOutline} className="members-icon" />
                    Players at the Table:
                  </h3>
                  {isHost && (
                    <div className="host-controls">
                      <IonButton 
                        fill="clear" 
                        size="small" 
                        className="order-btn"
                        onClick={() => setShowOrderModal(true)}
                      >
                        <IonIcon icon={swapVerticalOutline} />
                      </IonButton>
                    </div>
                  )}
                </div>
                
                <ul className="members-list">
                  {partyMembers.map((member, index) => (
                    <li key={index} className="member-item">
                      <div className="member-avatar">{member.charAt(0).toUpperCase()}</div>
                      <span className="member-name">{member}</span>
                      {member === hostUsername && <span className="host-tag"></span>}
                      {isHost && member !== username && (
                        <IonButton 
                          fill="clear" 
                          size="small" 
                          className="kick-btn"
                          onClick={() => kickPlayer(member)}
                        >
                          <IonIcon icon={closeCircleOutline} color="danger" />
                        </IonButton>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              
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