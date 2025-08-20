from flask import Flask, render_template, request, jsonify, session, redirect, url_for, send_from_directory
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, auth, firestore
import os
from datetime import datetime
import json
import secrets
from werkzeug.utils import secure_filename
import uuid

app = Flask(__name__)
app.secret_key = secrets.token_urlsafe(32)
CORS(app)

# Initialize Firebase
cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)

db = firestore.client()

# Admin credentials
ADMIN_ID = ""
ADMIN_PASSWORD = ""

# File upload configuration
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {
    'image': {'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'},
    'video': {'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm'},
    'audio': {'mp3', 'wav', 'ogg', 'aac', 'flac'},
    'document': {'pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx'}
}

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

def allowed_file(filename):
    ext = filename.rsplit('.', 1)[1].lower()
    for category, extensions in ALLOWED_EXTENSIONS.items():
        if ext in extensions:
            return True
    return False

def get_file_type(filename):
    ext = filename.rsplit('.', 1)[1].lower()
    for category, extensions in ALLOWED_EXTENSIONS.items():
        if ext in extensions:
            return category
    return 'document'

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/admin')
def admin():
    # Check if admin is logged in
    if not session.get('admin_logged_in'):
        return redirect(url_for('admin_login'))
    return render_template('admin.html')

@app.route('/admin/login', methods=['GET', 'POST'])
def admin_login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        if username == ADMIN_ID and password == ADMIN_PASSWORD:
            session['admin_logged_in'] = True
            return redirect(url_for('admin'))
        else:
            return render_template('admin_login.html', error='Invalid credentials')
    
    return render_template('admin_login.html')

@app.route('/admin/logout')
def admin_logout():
    session.pop('admin_logged_in', None)
    return redirect(url_for('index'))

@app.route('/room/<room_id>')
def room(room_id):
    room_ref = db.collection('rooms').document(room_id)
    room_doc = room_ref.get()
    
    # Check if room exists
    if not room_doc.exists:
        return redirect(url_for('index'))  # Redirect to home if room doesn't exist
    
    room_data = room_doc.to_dict()
    
    # Check if room is locked and user has access
    if room_data and room_data.get('is_locked'):
        if not session.get(f'access_{room_id}'):
            return redirect(url_for('room_password', room_id=room_id))
    
    # Get room name or use room_id as fallback
    room_name = room_data.get('name') if room_data and room_data.get('name') else room_id.replace('-', ' ').title()
    
    return render_template('room.html', room_id=room_id, room_name=room_name)

@app.route('/room/<room_id>/password', methods=['GET', 'POST'])
def room_password(room_id):
    room_ref = db.collection('rooms').document(room_id)
    room_data = room_ref.get().to_dict()
    
    if not room_data:
        return redirect(url_for('index'))
    
    if request.method == 'POST':
        password = request.form.get('password')
        
        if password == room_data.get('password'):
            session[f'access_{room_id}'] = True
            return redirect(url_for('room', room_id=room_id))
        else:
            return render_template('room_password.html', room_id=room_id, error='Invalid password')
    
    return render_template('room_password.html', room_id=room_id)

# Serve uploaded files
@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

# API Routes
@app.route('/api/send_message', methods=['POST'])
def send_message():
    try:
        data = request.json
        room_id = data.get('room_id')
        message = data.get('message')
        anonymous_id = data.get('anonymous_id')
        parent_id = data.get('parent_id')
        
        if not room_id or not message:
            return jsonify({'error': 'Missing room_id or message'}), 400
            
        # Get reply message data if this is a reply
        reply_to_message = None
        if parent_id:
            parent_ref = db.collection('rooms').document(room_id).collection('messages').document(parent_id)
            parent_doc = parent_ref.get()
            if parent_doc.exists:
                reply_to_message = parent_doc.to_dict()
                reply_to_message['id'] = parent_id
            
        # Add message to Firestore
        messages_ref = db.collection('rooms').document(room_id).collection('messages')
        message_data = {
            'text': message,
            'anonymous_id': anonymous_id,
            'timestamp': firestore.SERVER_TIMESTAMP,
            'parent_id': parent_id if parent_id else None,
            'reply_to_message': reply_to_message
        }
        
        messages_ref.add(message_data)
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/upload_file', methods=['POST'])
def upload_file():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
            
        file = request.files['file']
        room_id = request.form.get('room_id')
        anonymous_id = request.form.get('anonymous_id')
        parent_id = request.form.get('parent_id')
        
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
            
        if not allowed_file(file.filename):
            return jsonify({'error': 'File type not allowed'}), 400
            
        # Generate unique filename
        filename = secure_filename(file.filename)
        unique_filename = f"{uuid.uuid4()}_{filename}"
        file_path = os.path.join(UPLOAD_FOLDER, unique_filename)
        
        # Save file locally
        file.save(file_path)
        
        # Create file URL for local storage
        file_url = f"/uploads/{unique_filename}"
        
        # Get reply message data if this is a reply
        reply_to_message = None
        if parent_id:
            parent_ref = db.collection('rooms').document(room_id).collection('messages').document(parent_id)
            parent_doc = parent_ref.get()
            if parent_doc.exists:
                reply_to_message = parent_doc.to_dict()
                reply_to_message['id'] = parent_id
        
        # Add message to Firestore
        messages_ref = db.collection('rooms').document(room_id).collection('messages')
        message_data = {
            'file_url': file_url,
            'file_name': filename,
            'file_type': get_file_type(filename),
            'anonymous_id': anonymous_id,
            'timestamp': firestore.SERVER_TIMESTAMP,
            'parent_id': parent_id if parent_id else None,
            'reply_to_message': reply_to_message
        }
        
        messages_ref.add(message_data)
        
        return jsonify({'success': True, 'file_url': file_url})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/get_messages/<room_id>')
def get_messages(room_id):
    try:
        messages_ref = db.collection('rooms').document(room_id).collection('messages')
        messages = messages_ref.order_by('timestamp').stream()
        
        messages_list = []
        for msg in messages:
            msg_data = msg.to_dict()
            msg_data['id'] = msg.id
            if 'timestamp' in msg_data and msg_data['timestamp']:
                # Convert Firestore timestamp to Python datetime
                if hasattr(msg_data['timestamp'], 'timestamp'):
                    # It's a Firestore timestamp
                    timestamp = msg_data['timestamp'].timestamp()
                    msg_data['timestamp'] = datetime.fromtimestamp(timestamp).strftime('%Y-%m-%d %H:%M:%S')
                else:
                    # It's already a string
                    msg_data['timestamp'] = str(msg_data['timestamp'])
            else:
                msg_data['timestamp'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            messages_list.append(msg_data)
            
        return jsonify(messages_list)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
@app.route('/api/create_room', methods=['POST'])
def create_room():
    try:
        # Check if admin is logged in
        if not session.get('admin_logged_in'):
            return jsonify({'error': 'Unauthorized'}), 401
            
        data = request.json
        room_name = data.get('room_name')
        if not room_name or not room_name.strip():
            return jsonify({'error': 'Room name is required'}), 400

        room_description = data.get('room_description')
        is_locked = data.get('is_locked', False)
        room_password = data.get('room_password', '')
        
        # Create a valid room ID from the name
        room_id = room_name.lower().replace(' ', '-')
        # Remove any special characters that might cause issues
        import re
        room_id = re.sub(r'[^a-z0-9\-_]', '', room_id)
        
        # Ensure room ID is not empty
        if not room_id:
            room_id = f"room-{int(datetime.now().timestamp())}"
            
        # Check if room already exists
        room_ref = db.collection('rooms').document(room_id)
        if room_ref.get().exists:
            # Add timestamp to make it unique
            room_id = f"{room_id}-{int(datetime.now().timestamp())}"
            
        # Create the room
        room_ref.set({
            'name': room_name,
            'description': room_description,
            'is_locked': is_locked,
            'password': room_password,
            'created_at': firestore.SERVER_TIMESTAMP,
            'created_by': 'admin'
        })
        
        return jsonify({'success': True, 'room_id': room_id})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
        
@app.route('/api/update_room', methods=['POST'])
def update_room():
    try:
        # Check if admin is logged in
        if not session.get('admin_logged_in'):
            return jsonify({'error': 'Unauthorized'}), 401
            
        data = request.json
        room_id = data.get('room_id')
        room_name = data.get('room_name')
        room_description = data.get('room_description')
        is_locked = data.get('is_locked', False)
        room_password = data.get('room_password', '')
        
        if not room_id or not room_name or room_id == 'null':
            return jsonify({'error': 'Room ID and name are required'}), 400
            
        # Check if room exists
        room_ref = db.collection('rooms').document(room_id)
        if not room_ref.get().exists:
            return jsonify({'error': 'Room not found'}), 404
            
        # Update the room
        update_data = {
            'name': room_name,
            'description': room_description,
            'is_locked': is_locked,
            'updated_at': firestore.SERVER_TIMESTAMP
        }
        
        # Only update password if room is locked and password is provided
        if is_locked:
            update_data['password'] = room_password
        
        room_ref.update(update_data)
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/delete_room', methods=['POST'])
def delete_room():
    try:
        # Check if admin is logged in
        if not session.get('admin_logged_in'):
            return jsonify({'error': 'Unauthorized'}), 401
            
        data = request.json
        room_id = data.get('room_id')
        
        if not room_id:
            return jsonify({'error': 'Room ID is required'}), 400
            
        # Check if room exists
        room_ref = db.collection('rooms').document(room_id)
        if not room_ref.get().exists:
            return jsonify({'error': 'Room not found'}), 404
            
        # Delete all messages in the room first
        messages_ref = room_ref.collection('messages')
        messages = messages_ref.stream()
        for msg in messages:
            msg.reference.delete()
            
        # Delete the room
        room_ref.delete()
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/get_rooms')
def get_rooms():
    try:
        rooms_ref = db.collection('rooms')
        rooms = rooms_ref.stream()
        
        rooms_list = []
        for room in rooms:
            room_data = room.to_dict()
            room_data['id'] = room.id
            if 'password' in room_data:
                del room_data['password']
            rooms_list.append(room_data)
            
        return jsonify(rooms_list)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
@app.route('/api/verify_room_password', methods=['POST'])
def verify_room_password():
    try:
        data = request.json
        room_id = data.get('room_id')
        password = data.get('password')
        
        if not room_id or not password:
            return jsonify({'error': 'Missing room_id or password'}), 400
            
        room_ref = db.collection('rooms').document(room_id)
        room_doc = room_ref.get()
        
        if not room_doc.exists:
            return jsonify({'error': 'Room not found'}), 404
            
        room_data = room_doc.to_dict()
        
        # FIXED: Compare passwords directly
        if room_data.get('password') == password:
            return jsonify({'success': True})
        else:
            return jsonify({'success': False, 'error': 'Incorrect password'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
if __name__ == '__main__':

    app.run(debug=True)
