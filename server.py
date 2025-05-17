from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room
from pymongo import MongoClient
import random
import string


app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# MongoDB setup
client = MongoClient('mongodb://localhost:27017') #replace with your MongoDB connection string
db = client['party_app']
party_collection = db['parties']

def generate_party_code(length=6):
    characters = string.ascii_uppercase + string.digits
    return ''.join(random.choice(characters) for _ in range(length))

@app.route('/create-party', methods=['POST'])
def create_party():
    data = request.json
    host_name = data.get('username', 'Host')
    code = generate_party_code()

    while party_collection.find_one({'code': code}):
        code = generate_party_code()

    default_chip_values = {
        "white": 1,
        "red": 5,
        "blue": 10,
        "green": 25,
        "black": 100
    }

    default_starting_stack = {
        "white": 100,
        "red": 50,
        "blue": 10,
        "green": 4,
        "black": 1
    }

    party_data = {
        "code": code,
        "host": host_name,
        "settings": {
            "chip_values": default_chip_values,
            "starting_stack": default_starting_stack.copy(),
            "small_blind": 5,
            "big_blind": 10,
            "max_players": 6
        },
        "players": [{
            "username": host_name,
            "stack": default_starting_stack.copy(),
            "is_active": True,
            "has_folded": False,
            "position": "small_blind"
        }],
        "game_state": {
            "active": False,
            "current_round": 0,
            "dealer_index": 0,
            "turn_index": 0,
            "pot": {chip: 0 for chip in default_chip_values},
            "current_bet": 0
        }
    }

    party_collection.insert_one(party_data)
    return jsonify({'success': True, 'code': code, 'host_name': host_name})

@app.route('/join-party', methods=['POST'])
def join_party():
    data = request.json
    code = data.get('code')
    username = data.get('username')
    party = party_collection.find_one({'code': code})

    if not party:
        return jsonify({'success': False, 'message': 'Invalid party code'})

    if any(player['username'] == username for player in party['players']):
        return jsonify({'success': False, 'message': 'Username already taken'})

    if len(party['players']) >= party['settings']['max_players']:
        return jsonify({'success': False, 'message': 'Party is full'})

    new_player = {
        "username": username,
        "stack": party['settings']['starting_stack'].copy(),
        "is_active": True,
        "has_folded": False,
        "position": "big_blind" if len(party['players']) == 1 else None
    }

    party_collection.update_one({'code': code}, {'$push': {'players': new_player}})
    
    # Get updated player list
    updated_party = party_collection.find_one({'code': code})
    player_usernames = [p['username'] for p in updated_party['players']]
    
    socketio.emit('party_update', {
        'members': player_usernames,
        'message': f'{username} joined the party'
    }, room=code)

    return jsonify({'success': True, 'members': player_usernames})


@socketio.on('join_room')
def on_join(data):
    code = data['code']
    join_room(code)
    emit('joined_room', {'message': f'Joined party {code}'}, room=code)

@app.route('/party-status', methods=['POST'])
def party_status():
    data = request.json
    code = data.get('code')
    party = party_collection.find_one({'code': code})
    
    if not party:
        return jsonify({'success': False, 'message': 'Invalid party code'})
    
    player_usernames = [p['username'] for p in party['players']]
    return jsonify({'success': True, 'members': player_usernames})

@app.route('/leave-party', methods=['POST'])
def leave_party():
    data = request.json
    code = data.get('code')
    username = data.get('username')
    party = party_collection.find_one({'code': code})

    if not party:
        return jsonify({'success': False, 'message': 'Party not found'})
    
    if username == party['host']:
        # Host is leaving — delete the party
        party_collection.delete_one({'code': code})
        socketio.emit('party_update', {'members': [], 'message': 'Host ended the party'}, room=code)
        return jsonify({'success': True, 'message': 'Host ended the party'})
    else:
        # Guest is leaving - remove them from players array
        player_usernames = [p['username'] for p in party['players']]
        if username in player_usernames:
            party_collection.update_one(
                {'code': code}, 
                {'$pull': {'players': {'username': username}}}
            )
            
            # Get updated players list
            updated_party = party_collection.find_one({'code': code})
            updated_player_usernames = [p['username'] for p in updated_party['players']]
            
            socketio.emit('party_update', {
                'members': updated_player_usernames, 
                'message': f'{username} left the party'
            }, room=code)
            
            return jsonify({'success': True, 'message': f'{username} left the party'})
        else:
            return jsonify({'success': False, 'message': 'User not in party'})

@app.route('/update-order', methods=['POST'])
def update_order():
    """Update the order of players in a party"""
    data = request.json
    code = data.get('code')
    new_order = data.get('order')  # List of usernames in new order
    
    party = party_collection.find_one({'code': code})
    if not party:
        return jsonify({'success': False, 'message': 'Party not found'})
    
    # Get current player usernames
    current_players = {p['username']: p for p in party['players']}
    
    # Validate that the new order contains all players
    if sorted([p['username'] for p in party['players']]) != sorted(new_order):
        return jsonify({'success': False, 'message': 'Invalid player order'})
    
    # Create a new players array in the specified order
    new_players_array = []
    for username in new_order:
        player = current_players[username]
        new_players_array.append(player)
    
    # Update the players array
    party_collection.update_one({'code': code}, {'$set': {'players': new_players_array}})
    
    # Notify all clients in the room
    socketio.emit('party_update', {
        'members': new_order, 
        'message': 'Player order has been updated'
    }, room=code)
    
    return jsonify({'success': True})

@app.route('/kick-player', methods=['POST'])
def kick_player():
    """Kick a player from the party"""
    data = request.json
    code = data.get('code')
    host = data.get('host')
    kicked_player = data.get('kickedPlayer')
    
    party = party_collection.find_one({'code': code})
    if not party:
        return jsonify({'success': False, 'message': 'Party not found'})
    
    # Verify that the request is from the host
    if host != party['host']:
        return jsonify({'success': False, 'message': 'Only the host can kick players'})
    
    # Make sure the player exists in the party
    player_usernames = [p['username'] for p in party['players']]
    if kicked_player not in player_usernames:
        return jsonify({'success': False, 'message': 'Player not found in party'})
    
    # Don't allow the host to kick themselves
    if kicked_player == host:
        return jsonify({'success': False, 'message': 'Host cannot kick themselves'})
    
    # Remove the player
    party_collection.update_one(
        {'code': code}, 
        {'$pull': {'players': {'username': kicked_player}}}
    )
    
    # Get updated players list
    updated_party = party_collection.find_one({'code': code})
    updated_player_usernames = [p['username'] for p in updated_party['players']]
    
    # Notify all clients in the room
    socketio.emit('party_update', {
        'members': updated_player_usernames, 
        'message': f'{kicked_player} has been kicked from the party'
    }, room=code)
    
    # Send a special event to the kicked player
    socketio.emit('player_kicked', {
        'username': kicked_player
    }, room=code)
    
    return jsonify({'success': True})

@app.route('/start-game', methods=['POST'])
def start_game():
    """Start the game for all players in the party"""
    data = request.json
    code = data.get('code')
    host = data.get('host')
    
    party = party_collection.find_one({'code': code})
    if not party:
        return jsonify({'success': False, 'message': 'Party not found'})
    
    # Verify that the request is from the host
    if host != party['host']:
        return jsonify({'success': False, 'message': 'Only the host can start the game'})
    
    # Make sure there are enough players (at least 2)
    if len(party['players']) < 2:
        return jsonify({'success': False, 'message': 'Need at least 2 players to start a game'})
    
    # Initialize game state
    game_state = {
        'active': True,
        'current_round': 0,
        'dealer_index': 0,
        'turn_index': 0,  # First player after dealer
        'pot': {chip: 0 for chip in party['settings']['chip_values']},
        'current_bet': 0
    }
    
    # Update party with game state
    party_collection.update_one(
        {'code': code}, 
        {'$set': {'game_state': game_state}}
    )
    
    # Notify all clients to start the game
    socketio.emit('start_game', room=code)
    
    return jsonify({'success': True})

@app.route('/get-player-order/<code>', methods=['GET'])
def get_player_order(code):
    party = party_collection.find_one({'code': code})
    if not party:
        return jsonify({'success': False, 'message': 'Game not found'})
    
    return jsonify({
        'success': True,
        'players': party['players'],
        'currentTurn': party.get('game_state', {}).get('turn_index', 0)
    })

@app.route('/get-game-data/<code>', methods=['GET'])
def get_game_data(code):
    # Find the party document in MongoDB by code
    party = party_collection.find_one({'code': code})
    
    if party:
        return jsonify({
            'success': True,
            'players': party['players'],
            'currentTurn': party.get('game_state', {}).get('turn_index', 0),
            'host': party['host'],
            'settings': party['settings'],
            'game_state': party['game_state']
        })
    else:
        return jsonify({
            'success': False,
            'message': 'Game not found'
        })

@app.route('/advance-turn', methods=['POST'])
def advance_turn():
    """Advance the turn to the next player"""
    data = request.json
    code = data.get('code')
    username = data.get('username')  # Current player's username
    
    party = party_collection.find_one({'code': code})
    if not party:
        return jsonify({'success': False, 'message': 'Party not found'})
    
    # Make sure the game is active
    game_state = party.get('game_state', {})
    if not game_state.get('active', False):
        return jsonify({'success': False, 'message': 'Game is not active'})
    
    # Make sure it's the user's turn
    current_turn_index = game_state.get('turn_index', 0)
    player_usernames = [p['username'] for p in party['players']]
    
    if current_turn_index >= len(player_usernames) or player_usernames[current_turn_index] != username:
        return jsonify({'success': False, 'message': 'Not your turn'})
    
    # Advance to the next player
    next_turn_index = (current_turn_index + 1) % len(player_usernames)
    
    # Update the game state
    game_state['turn_index'] = next_turn_index
    party_collection.update_one(
        {'code': code}, 
        {'$set': {'game_state': game_state}}
    )
    
    # Notify all clients about the turn change
    socketio.emit('turn_update', {
        'currentTurn': next_turn_index,
        'currentPlayer': player_usernames[next_turn_index]
    }, room=code)
    
    return jsonify({
        'success': True, 
        'currentTurn': next_turn_index,
        'currentPlayer': player_usernames[next_turn_index]
    })

@app.route('/get-game-settings/<code>', methods=['GET'])
def get_game_settings(code):
    """Get the current game settings for a party"""
    party = party_collection.find_one({'code': code})
    
    if not party:
        return jsonify({'success': False, 'message': 'Party not found'})
    
    return jsonify({
        'success': True,
        'settings': party['settings']
    })

@app.route('/update-settings', methods=['POST'])
def update_settings():
    """Update game settings"""
    data = request.json
    code = data.get('code')
    host = data.get('host')
    settings = data.get('settings')
    
    party = party_collection.find_one({'code': code})
    if not party:
        return jsonify({'success': False, 'message': 'Party not found'})
    
    # Verify that the request is from the host
    if host != party['host']:
        return jsonify({'success': False, 'message': 'Only the host can update settings'})
    
    # Validate settings format
    required_fields = ['chip_values', 'starting_stack', 'small_blind', 'big_blind', 'max_players']
    for field in required_fields:
        if field not in settings:
            return jsonify({'success': False, 'message': f'Missing required setting: {field}'})
    
    # Validate chip values - make sure all colors are present
    required_chips = ['white', 'red', 'blue', 'green', 'black']
    for chip in required_chips:
        if chip not in settings['chip_values'] or chip not in settings['starting_stack']:
            return jsonify({'success': False, 'message': f'Missing chip color: {chip}'})
    
    # Validate numerical values
    if not isinstance(settings['small_blind'], int) or settings['small_blind'] < 1:
        return jsonify({'success': False, 'message': 'Small blind must be a positive integer'})
    
    if not isinstance(settings['big_blind'], int) or settings['big_blind'] < settings['small_blind']:
        return jsonify({'success': False, 'message': 'Big blind must be greater than or equal to small blind'})
    
    if not isinstance(settings['max_players'], int) or settings['max_players'] < 2 or settings['max_players'] > 10:
        return jsonify({'success': False, 'message': 'Max players must be between 2 and 10'})
    
    # Check if changing max_players would kick current players
    current_player_count = len(party['players'])
    if current_player_count > settings['max_players']:
        return jsonify({
            'success': False, 
            'message': f'Cannot reduce max players below current player count ({current_player_count})'
        })
    
    # Update settings in database
    party_collection.update_one(
        {'code': code}, 
        {'$set': {'settings': settings}}
    )
    
    # Update starting stack for players who haven't made any moves yet
    # This allows changing the starting stack before the game begins
    if not party['game_state']['active']:
        for player in party['players']:
            player['stack'] = settings['starting_stack'].copy()
            
        party_collection.update_one(
            {'code': code}, 
            {'$set': {'players': party['players']}}
        )
    
    # Notify all clients about the settings update
    socketio.emit('settings_updated', {
        'settings': settings,
        'message': 'Game settings have been updated'
    }, room=code)
    
    return jsonify({'success': True})

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5050, debug=True)