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
client = MongoClient('mongodb://localhost:27017')
db = client['party_app']
party_collection = db['parties']

def generate_party_code(length=6):
    characters = string.ascii_uppercase + string.digits
    return ''.join(random.choice(characters) for _ in range(length))

@app.route('/create-party', methods=['POST'])
def create_party():
    data = request.json
    host_name = data.get('username', 'Host')  # Get host's name
    code = generate_party_code()
    while party_collection.find_one({'code': code}):
        code = generate_party_code()
    
    party_data = {
        'code': code,
        'host': host_name,
        'members': [host_name]
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

    if username in party['members']:
        return jsonify({'success': False, 'message': 'Username already taken'})

    party['members'].append(username)
    party_collection.update_one({'code': code}, {'$set': {'members': party['members']}})
    socketio.emit('party_update', {'members': party['members'], 'message': f'{username} joined the party'}, room=code)

    return jsonify({'success': True, 'members': party['members']})

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
    
    return jsonify({'success': True, 'members': party['members']})

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
        # Guest is leaving
        if username in party['members']:
            party['members'].remove(username)
            party_collection.update_one({'code': code}, {'$set': {'members': party['members']}})
            socketio.emit('party_update', {'members': party['members'], 'message': f'{username} left the party'}, room=code)
            return jsonify({'success': True, 'message': f'{username} left the party'})
        else:
            return jsonify({'success': False, 'message': 'User not in party'})

@app.route('/update-order', methods=['POST'])
def update_order():
    """Update the order of players in a party"""
    data = request.json
    code = data.get('code')
    new_order = data.get('order')
    
    party = party_collection.find_one({'code': code})
    if not party:
        return jsonify({'success': False, 'message': 'Party not found'})
    
    # Validate that the new order contains all members
    if sorted(party['members']) != sorted(new_order):
        return jsonify({'success': False, 'message': 'Invalid player order'})
    
    # Update the order
    party_collection.update_one({'code': code}, {'$set': {'members': new_order}})
    
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
    if kicked_player not in party['members']:
        return jsonify({'success': False, 'message': 'Player not found in party'})
    
    # Don't allow the host to kick themselves
    if kicked_player == host:
        return jsonify({'success': False, 'message': 'Host cannot kick themselves'})
    
    # Remove the player
    party['members'].remove(kicked_player)
    party_collection.update_one({'code': code}, {'$set': {'members': party['members']}})
    
    # Notify all clients in the room
    socketio.emit('party_update', {
        'members': party['members'], 
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
    if len(party['members']) < 2:
        return jsonify({'success': False, 'message': 'Need at least 2 players to start a game'})
    
    # Initialize game state
    game_state = {
        'active': True,
        'current_round': 0,
        'dealer_index': 0,
        'turn_index': 0  # First player after dealer
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
        'players': party['members'],
        'currentTurn': party.get('currentTurn', 0)
    })



@app.route('/get-game-data/<code>', methods=['GET'])
def get_game_data(code):
    # Find the party document in MongoDB by code
    party = party_collection.find_one({'code': code})
    
    if party:
        return jsonify({
            'success': True,
            'players': party['members'],
            'currentTurn': party.get('game_state', {}).get('turn_index', 0),
            'host': party['host']
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
    if party['members'][current_turn_index] != username:
        return jsonify({'success': False, 'message': 'Not your turn'})
    
    # Advance to the next player
    next_turn_index = (current_turn_index + 1) % len(party['members'])
    
    # Update the game state
    game_state['turn_index'] = next_turn_index
    party_collection.update_one(
        {'code': code}, 
        {'$set': {'game_state': game_state}}
    )
    
    # Notify all clients about the turn change
    socketio.emit('turn_update', {
        'currentTurn': next_turn_index,
        'currentPlayer': party['members'][next_turn_index]
    }, room=code)
    
    return jsonify({
        'success': True, 
        'currentTurn': next_turn_index,
        'currentPlayer': party['members'][next_turn_index]
    })

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5050, debug=True)