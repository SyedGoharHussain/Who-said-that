// Global variables
let currentRoom = null;
let anonymousId = null;
let currentRoomData = null;
let selectedMessageId = null;
let lastMessageId = null; // Track last message to avoid reloading
let isLoading = false; // Prevent multiple simultaneous loads
let editingRoomId = null; // Track which room is being edited
let replyToMessage = null; // Store the message being replied to

// DOM Content Loaded
document.addEventListener('DOMContentLoaded', function () {
    initializeApp();
});

// Initialize the application based on current page
function initializeApp() {
    // Generate unique anonymous ID if not exists
    function generateAnonymousId() {
        // Generate a more unique ID with timestamp + random number
        const timestamp = Date.now().toString(36); // Base36 for shorter string
        const randomNum = Math.floor(Math.random() * 10000); // 4-digit random
        return 'user_' + timestamp + '_' + randomNum;
    }

    // Generate a new ID for each session (don't store in localStorage)
    anonymousId = generateAnonymousId();

    // Update user ID display if on room page
    const userIdElement = document.getElementById('user-id');
    if (userIdElement) {
        userIdElement.textContent = anonymousId;
    }

    // Page-specific initialization
    if (document.getElementById('rooms-grid')) {
        // Home page
        loadRooms();
        // Removed: setupPasswordModal();
    } else if (document.getElementById('admin-rooms-list')) {
        // Admin page
        loadRoomsForAdmin();
        setupRoomCreationForm();
        setupEditDeleteModals();
    } else if (document.getElementById('messages-container')) {
        // Room page
        initializeChatRoom();
    }

    // Setup navigation
    setupNavigation();
}

// Generate unique anonymous ID
function generateUniqueAnonymousId() {
    // Use a random number and timestamp for uniqueness
    return 'anonymous' + Math.floor(Math.random() * 1000000) + Date.now();
}
async function loadRooms() {
    try {
        const response = await fetch('/api/get_rooms');
        const rooms = await response.json();

        const roomsGrid = document.getElementById('rooms-grid');
        roomsGrid.innerHTML = '';

        if (rooms.length === 0) {
            roomsGrid.innerHTML = '<p class="no-rooms">No rooms available yet. Check back later!</p>';
            return;
        }

        rooms.forEach(room => {
            const roomCard = document.createElement('div');
            roomCard.className = 'room-card';
            roomCard.innerHTML = `
                <h3>${room.name}</h3>
                <p>${room.description || 'No description'}</p>
                <div class="room-meta">
                    <span><i class="fas fa-users"></i> <span class="online-count" data-room="${room.id}"></span> </span>
                    ${room.is_locked ? '<span class="locked-badge"><i class="fas fa-lock"></i> Locked</span>' : ''}
                </div>
                <button class="btn ${room.is_locked ? 'btn-outline' : ''} join-room" data-room-id="${room.id}" data-locked="${room.is_locked}">
                    Join Room
                </button>
            `;
            roomsGrid.appendChild(roomCard);

            // Load online count for this room
            loadOnlineCount(room.id);
        });

        // Add event listeners to join buttons
        document.querySelectorAll('.join-room').forEach(button => {
            button.addEventListener('click', function () {
                const roomId = this.getAttribute('data-room-id');
                const isLocked = this.getAttribute('data-locked') === 'true';

                if (isLocked) {
                    // Redirect to password page instead of showing modal
                    window.location.href = `/room/${roomId}/password`;
                } else {
                    joinRoom(roomId);
                }
            });
        });

        // Update room count
        document.getElementById('room-count').textContent = rooms.length;

    } catch (error) {
        console.error('Error loading rooms:', error);
    }
}

// Load online user count for a room
async function loadOnlineCount(roomId) {
    try {
        const response = await fetch(`/api/get_online_users/${roomId}`);
        const data = await response.json();

        const countElement = document.querySelector(`.online-count[data-room="${roomId}"]`);
        if (countElement) {
            countElement.textContent = data.count;
        }
    } catch (error) {
        console.error('Error loading online count:', error);
    }
}

// Load rooms for admin page
async function loadRoomsForAdmin() {
    try {
        const response = await fetch('/api/get_rooms');
        const rooms = await response.json();

        const roomsList = document.getElementById('admin-rooms-list');
        roomsList.innerHTML = '';

        if (rooms.length === 0) {
            roomsList.innerHTML = '<p class="no-rooms">No rooms created yet.</p>';
            return;
        }

        rooms.forEach(room => {
            const roomItem = document.createElement('div');
            roomItem.className = 'admin-room-item';
            roomItem.innerHTML = `
                <div class="admin-room-header">
                    <h4>${room.name}</h4>
                    <span class="room-status">${room.is_locked ? 'Locked' : 'Public'}</span>
                </div>
                <p>${room.description || 'No description'}</p>
                <div class="admin-room-actions">
                    <button class="btn btn-small edit-room-btn" data-room-id="${room.id}" data-room-name="${room.name}" data-room-description="${room.description || ''}" data-room-locked="${room.is_locked}">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="btn btn-small btn-danger delete-room-btn" data-room-id="${room.id}" data-room-name="${room.name}">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            `;
            roomsList.appendChild(roomItem);
        });

        // Add event listeners to edit and delete buttons
        setupRoomActionListeners();

    } catch (error) {
        console.error('Error loading rooms for admin:', error);
    }
}

// Setup room action listeners
function setupRoomActionListeners() {
    // Edit buttons
    document.querySelectorAll('.edit-room-btn').forEach(button => {
        button.addEventListener('click', function () {
            const roomId = this.getAttribute('data-room-id');
            const roomName = this.getAttribute('data-room-name');
            const roomDescription = this.getAttribute('data-room-description');
            const roomLocked = this.getAttribute('data-room-locked') === 'true';

            showEditModal(roomId, roomName, roomDescription, roomLocked);
        });
    });

    // Delete buttons
    document.querySelectorAll('.delete-room-btn').forEach(button => {
        button.addEventListener('click', function () {
            const roomId = this.getAttribute('data-room-id');
            const roomName = this.getAttribute('data-room-name');

            showDeleteModal(roomId, roomName);
        });
    });
}

// Setup edit and delete modals
function setupEditDeleteModals() {
    // Create edit modal
    const editModal = document.createElement('div');
    editModal.className = 'edit-modal';
    editModal.id = 'edit-room-modal';
    editModal.innerHTML = `
        <div class="edit-modal-content">
            <h2><i class="fas fa-edit"></i> Edit Room</h2>
            <form id="edit-room-form">
                <div class="form-group">
                    <label for="edit-room-name">Room Name</label>
                    <input type="text" id="edit-room-name" required>
                </div>
                <div class="form-group">
                    <label for="edit-room-description">Description</label>
                    <textarea id="edit-room-description" rows="3"></textarea>
                </div>
                <div class="checkbox-container">
                    <input type="checkbox" id="edit-room-locked">
                    <label for="edit-room-locked">Locked Room (requires password)</label>
                </div>
                <div class="form-group" id="edit-password-field" style="display: none;">
                    <label for="edit-room-password">Password</label>
                    <input type="password" id="edit-room-password">
                </div>
                <div class="edit-modal-buttons">
                    <button type="submit" class="btn">Update Room</button>
                    <button type="button" class="btn btn-outline" id="cancel-edit">Cancel</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(editModal);

    // Create delete modal
    const deleteModal = document.createElement('div');
    deleteModal.className = 'edit-modal';
    deleteModal.id = 'delete-room-modal';
    deleteModal.innerHTML = `
        <div class="edit-modal-content">
            <h2><i class="fas fa-exclamation-triangle"></i> Delete Room</h2>
            <p>Are you sure you want to delete "<span id="delete-room-name"></span>"? This action cannot be undone.</p>
            <div class="edit-modal-buttons">
                <button type="button" class="btn btn-danger" id="confirm-delete">Delete Room</button>
                <button type="button" class="btn btn-outline" id="cancel-delete">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(deleteModal);

    // Setup edit modal functionality
    const editForm = document.getElementById('edit-room-form');
    const editLockedCheckbox = document.getElementById('edit-room-locked');
    const editPasswordField = document.getElementById('edit-password-field');
    const cancelEditBtn = document.getElementById('cancel-edit');

    editLockedCheckbox.addEventListener('change', function () {
        editPasswordField.style.display = this.checked ? 'block' : 'none';
        if (this.checked) {
            document.getElementById('edit-room-password').required = true;
        } else {
            document.getElementById('edit-room-password').required = false;
        }
    });

    editForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        const roomName = document.getElementById('edit-room-name').value;
        const roomDescription = document.getElementById('edit-room-description').value;
        const isLocked = document.getElementById('edit-room-locked').checked;
        const roomPassword = document.getElementById('edit-room-password').value;

        if (isLocked && !roomPassword) {
            alert('Please enter a password for the locked room');
            return;
        }

        try {
            const response = await fetch('/api/update_room', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    room_id: editingRoomId,
                    room_name: roomName,
                    room_description: roomDescription,
                    is_locked: isLocked,
                    room_password: roomPassword
                })
            });

            const result = await response.json();

            if (result.success) {
                alert('Room updated successfully!');
                hideEditModal();
                loadRoomsForAdmin();
            } else {
                alert('Error updating room: ' + result.error);
            }
        } catch (error) {
            console.error('Error updating room:', error);
            alert('Error updating room. Please try again.');
        }
    });

    cancelEditBtn.addEventListener('click', hideEditModal);

    // Setup delete modal functionality
    const confirmDeleteBtn = document.getElementById('confirm-delete');
    const cancelDeleteBtn = document.getElementById('cancel-delete');

    confirmDeleteBtn.addEventListener('click', async function () {
        try {
            const response = await fetch('/api/delete_room', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    room_id: editingRoomId
                })
            });

            const result = await response.json();

            if (result.success) {
                alert('Room deleted successfully!');
                hideDeleteModal();
                loadRoomsForAdmin();
            } else {
                alert('Error deleting room: ' + result.error);
            }
        } catch (error) {
            console.error('Error deleting room:', error);
            alert('Error deleting room. Please try again.');
        }
    });

    cancelDeleteBtn.addEventListener('click', hideDeleteModal);
}

// Show edit modal
function showEditModal(roomId, roomName, roomDescription, roomLocked) {
    editingRoomId = roomId;
    document.getElementById('edit-room-name').value = roomName;
    document.getElementById('edit-room-description').value = roomDescription;
    document.getElementById('edit-room-locked').checked = roomLocked;
    document.getElementById('edit-password-field').style.display = roomLocked ? 'block' : 'none';
    document.getElementById('edit-room-modal').style.display = 'flex';
}

// Hide edit modal
function hideEditModal() {
    document.getElementById('edit-room-modal').style.display = 'none';
    editingRoomId = null;
}

// Show delete modal
function showDeleteModal(roomId, roomName) {
    editingRoomId = roomId;
    document.getElementById('delete-room-name').textContent = roomName;
    document.getElementById('delete-room-modal').style.display = 'flex';
}

// Hide delete modal
function hideDeleteModal() {
    document.getElementById('delete-room-modal').style.display = 'none';
    editingRoomId = null;
}

// Setup room creation form
function setupRoomCreationForm() {
    const form = document.getElementById('create-room-form');
    const lockedCheckbox = document.getElementById('room-locked');
    const passwordField = document.getElementById('password-field');

    // Toggle password field based on locked checkbox
    lockedCheckbox.addEventListener('change', function () {
        passwordField.style.display = this.checked ? 'block' : 'none';
        if (this.checked) {
            document.getElementById('room-password').required = true;
        } else {
            document.getElementById('room-password').required = false;
        }
    });

    // Handle form submission
    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        const roomName = document.getElementById('room-name').value.trim();
        const roomDescription = document.getElementById('room-description').value;
        const isLocked = document.getElementById('room-locked').checked;
        const roomPassword = document.getElementById('room-password').value;

        if (!roomName) {
            alert('Room name is required');
            return;
        }
        if (isLocked && !roomPassword) {
            alert('Please enter a password for the locked room');
            return;
        }

        try {
            const response = await fetch('/api/create_room', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    room_name: roomName,
                    room_description: roomDescription,
                    is_locked: isLocked,
                    room_password: roomPassword
                })
            });

            const result = await response.json();

            if (result.success) {
                alert('Room created successfully!');
                form.reset();
                passwordField.style.display = 'none';
                loadRoomsForAdmin();
            } else {
                alert('Error creating room: ' + result.error);
            }
        } catch (error) {
            console.error('Error creating room:', error);
            alert('Error creating room. Please try again.');
        }
    });
}

function setupPasswordModal() {
    const modal = document.getElementById('password-modal');
    const joinButton = document.getElementById('join-room-btn');
    const cancelButton = document.getElementById('cancel-password');
    const passwordInput = document.getElementById('room-password');
    const errorMessage = document.getElementById('password-error');

    let targetRoomId = null;

    // Show password modal
    window.showPasswordModal = function (roomId) {
        targetRoomId = roomId;
        modal.style.display = 'flex';
        passwordInput.value = '';
        errorMessage.textContent = '';
        errorMessage.style.display = 'none';
    }

    // Hide password modal
    function hidePasswordModal() {
        modal.style.display = 'none';
        targetRoomId = null;
    }

    // Join room with password
    joinButton.addEventListener('click', async function () {
        if (!targetRoomId || targetRoomId === 'null') {
            errorMessage.textContent = 'Invalid room';
            errorMessage.style.display = 'block';
            return;
        }

        try {
            const response = await fetch('/api/verify_room_password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    room_id: targetRoomId,
                    password: passwordInput.value
                })
            });

            const result = await response.json();

            if (result.success) {
                hidePasswordModal();
                joinRoom(targetRoomId);
            } else {
                errorMessage.textContent = result.error || 'Incorrect password';
                errorMessage.style.display = 'block';
            }
        } catch (error) {
            console.error('Error verifying password:', error);
            errorMessage.textContent = 'Error verifying password. Please try again.';
            errorMessage.style.display = 'block';
        }
    });

    // Cancel button
    cancelButton.addEventListener('click', hidePasswordModal);

    // Allow pressing Enter to submit
    passwordInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            joinButton.click();
        }
    });
}

// Join a room
function joinRoom(roomId) {
    if (!roomId || roomId === 'null') {
        console.error('Invalid room ID');
        return;
    }
    window.location.href = `/room/${roomId}`;
}

// Initialize chat room
function initializeChatRoom() {
    // Get room ID from global variable set in room.html
    if (typeof roomId !== 'undefined') {
        currentRoom = roomId;
        loadRoomData();
        loadMessages();
        setupMessageSending();
        setupReplyModal();
        setupFileUpload();
        loadOnlineUsers();

        // Periodically refresh messages and online count (less frequent)
        setInterval(loadMessages, 5000); // Reduced from 3s to 5s
        setInterval(() => loadOnlineUsers(), 10000); // Reduced from 5s to 10s
    } else {
        console.error('Room ID not defined');
    }

    // Leave room button
    const leaveButton = document.getElementById('leave-room');
    if (leaveButton) {
        leaveButton.addEventListener('click', function () {
            window.location.href = '/';
        });
    }
}

// Load room data
async function loadRoomData() {
    try {
        // In a real app, you'd fetch this from your API
        document.getElementById('room-title').textContent = currentRoom.replace(/-/g, ' ');
        document.getElementById('room-description').textContent = 'A room for chatting anonymously';

    } catch (error) {
        console.error('Error loading room data:', error);
    }
}

// Load messages with smart caching
async function loadMessages() {
    if (isLoading) return; // Prevent multiple simultaneous loads

    try {
        isLoading = true;
        const response = await fetch(`/api/get_messages/${currentRoom}`);
        const messages = await response.json();

        // Check if we have new messages
        if (messages.length > 0) {
            const latestMessageId = messages[messages.length - 1].id;

            if (lastMessageId !== latestMessageId) {
                // Only update if we have new messages
                updateMessagesDisplay(messages);
                lastMessageId = latestMessageId;
            }
        } else if (lastMessageId === null) {
            // First load with no messages
            updateMessagesDisplay(messages);
        }

    } catch (error) {
        console.error('Error loading messages:', error);
    } finally {
        isLoading = false;
    }
}

// Update messages display
function updateMessagesDisplay(messages) {
    const messagesContainer = document.getElementById('messages-container');
    if (!messagesContainer) return;

    messagesContainer.innerHTML = '';

    messages.forEach(message => {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${message.anonymous_id === anonymousId ? 'own' : 'other'}`;

        const headerDiv = document.createElement('div');
        headerDiv.className = 'message-header';

        const senderSpan = document.createElement('span');
        senderSpan.className = 'message-sender';
        // Show the actual anonymous ID instead of just "Anonymous"
        senderSpan.textContent = message.anonymous_id || 'Anonymous';

        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        timeSpan.textContent = formatTime(message.timestamp);

        headerDiv.appendChild(senderSpan);
        headerDiv.appendChild(timeSpan);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        // Handle different message types
        if (message.file_url) {
            // File message
            if (message.file_type === 'image') {
                contentDiv.innerHTML = `<img src="${message.file_url}" alt="Image" class="message-image" onclick="openImageModal('${message.file_url}')">`;
            } else if (message.file_type === 'video') {
                contentDiv.innerHTML = `<video controls class="message-video"><source src="${message.file_url}" type="video/mp4">Your browser does not support video.</video>`;
            } else if (message.file_type === 'audio') {
                contentDiv.innerHTML = `<audio controls class="message-audio"><source src="${message.file_url}" type="audio/mpeg">Your browser does not support audio.</audio>`;
            } else {
                // Document file
                contentDiv.innerHTML = `
                    <div class="file-message">
                        <i class="fas fa-file"></i>
                        <div class="file-info">
                            <div class="file-name">${message.file_name}</div>
                            <div class="file-size">${formatFileSize(message.file_size)}</div>
                        </div>
                        <a href="${message.file_url}" download class="download-btn">
                            <i class="fas fa-download"></i>
                        </a>
                    </div>
                `;
            }
        } else {
            // Text message - use 'text' field from backend
            contentDiv.textContent = message.text || '';
        }

        // Add reply indicator if this is a reply
        if (message.reply_to_message) {
            const replyDiv = document.createElement('div');
            replyDiv.className = 'reply-indicator';
            replyDiv.innerHTML = `
                <div class="reply-to">
                    <span class="reply-sender">${message.reply_to_message.anonymous_id || 'Anonymous'}</span>
                    <span class="reply-content">${message.reply_to_message.text || ''}</span>
                </div>
            `;
            messageDiv.appendChild(replyDiv);
        }

        messageDiv.appendChild(headerDiv);
        messageDiv.appendChild(contentDiv);

        // Add click handler for reply
        messageDiv.addEventListener('click', function (e) {
            if (e.target.tagName !== 'A' && e.target.tagName !== 'IMG' && e.target.tagName !== 'VIDEO' && e.target.tagName !== 'AUDIO') {
                setReplyToMessage(message);
            }
        });

        messagesContainer.appendChild(messageDiv);
    });

    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Add message to UI
function addMessageToUI(message) {
    const messagesContainer = document.getElementById('messages-container');
    const isOwnMessage = message.anonymous_id === anonymousId;

    const messageElement = document.createElement('div');
    messageElement.className = `message ${isOwnMessage ? 'own' : 'other'}`;
    messageElement.dataset.id = message.id;

    let replyIndicator = '';
    if (message.parent_id && message.reply_to_message) {
        const replyText = message.reply_to_message.text || 'Message not found';
        const replySender = message.reply_to_message.anonymous_id || 'Unknown';
        replyIndicator = `
            <div class="reply-indicator">
                <div class="reply-to">
                    <strong>${replySender}:</strong> ${replyText}
                </div>
            </div>
        `;
    }

    let messageContent = '';
    if (message.file_url) {
        // File message
        const fileType = getFileType(message.file_url);
        if (fileType === 'image') {
            messageContent = `<img src="${message.file_url}" alt="Image" class="message-image" onclick="openFileViewer('${message.file_url}', 'image')">`;
        } else if (fileType === 'video') {
            messageContent = `
                <video controls class="message-video">
                    <source src="${message.file_url}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
            `;
        } else if (fileType === 'audio') {
            messageContent = `
                <audio controls class="message-audio">
                    <source src="${message.file_url}" type="audio/mpeg">
                    Your browser does not support the audio tag.
                </audio>
            `;
        } else {
            // Document or other file
            const fileName = message.file_name || 'Document';
            messageContent = `
                <div class="file-message" onclick="openFileViewer('${message.file_url}', 'document', '${fileName}')">
                    <i class="fas fa-file"></i>
                    <span>${fileName}</span>
                    <small>Click to download</small>
                </div>
            `;
        }
    } else {
        // Text message
        messageContent = `<div class="message-content">${message.text}</div>`;
    }

    messageElement.innerHTML = `
        <div class="message-header">
            <span class="message-sender">${message.anonymous_id}</span>
            <span class="message-time">${formatTime(message.timestamp)}</span>
        </div>
        ${replyIndicator}
        ${messageContent}
        <div class="message-actions">
            <button class="message-action reply-btn"><i class="fas fa-reply"></i> Reply</button>
        </div>
    `;

    messagesContainer.appendChild(messageElement);

    // Add event listener for reply button
    const replyBtn = messageElement.querySelector('.reply-btn');
    replyBtn.addEventListener('click', function () {
        showReplyModal(message.id, message.text || message.file_name || 'File', message.anonymous_id, message);
    });
}

// Get file type from URL
function getFileType(fileUrl) {
    const extension = fileUrl.split('.').pop().toLowerCase();
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
    const videoExts = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm'];
    const audioExts = ['mp3', 'wav', 'ogg', 'aac', 'flac'];

    if (imageExts.includes(extension)) return 'image';
    if (videoExts.includes(extension)) return 'video';
    if (audioExts.includes(extension)) return 'audio';
    return 'document';
}

// Format timestamp
function formatTime(timestamp) {
    try {
        const date = new Date(timestamp);
        const now = new Date();

        // Check if date is valid
        if (isNaN(date.getTime())) {
            return 'Just now';
        }

        const diff = now - date;

        if (diff < 60000) { // Less than 1 minute
            return 'Just now';
        } else if (diff < 3600000) { // Less than 1 hour
            const minutes = Math.floor(diff / 60000);
            return `${minutes}m ago`;
        } else if (diff < 86400000) { // Less than 1 day
            const hours = Math.floor(diff / 3600000);
            return `${hours}h ago`;
        } else if (diff < 604800000) { // Less than 1 week
            const days = Math.floor(diff / 86400000);
            return `${days}d ago`;
        } else {
            return date.toLocaleDateString();
        }
    } catch (error) {
        console.error('Error formatting timestamp:', error);
        return 'Just now';
    }
}

// Format file size
function formatFileSize(bytes) {
    if (!bytes) return 'Unknown size';

    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

// Setup file upload
function setupFileUpload() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'file-input';
    fileInput.accept = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.xls,.xlsx,.ppt,.pptx';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');

    // Add file upload button
    const uploadButton = document.createElement('button');
    uploadButton.type = 'button';
    uploadButton.className = 'upload-btn';
    uploadButton.innerHTML = '<i class="fas fa-paperclip"></i>';
    uploadButton.title = 'Attach file';

    // Insert upload button before send button
    sendButton.parentNode.insertBefore(uploadButton, sendButton);

    // File upload button click
    uploadButton.addEventListener('click', function () {
        fileInput.click();
    });

    // File selection
    fileInput.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (file) {
            uploadFile(file);
        }
    });

    // Drag and drop
    const messageInputContainer = document.querySelector('.message-input-container');

    messageInputContainer.addEventListener('dragover', function (e) {
        e.preventDefault();
        messageInputContainer.classList.add('drag-over');
    });

    messageInputContainer.addEventListener('dragleave', function (e) {
        e.preventDefault();
        messageInputContainer.classList.remove('drag-over');
    });

    messageInputContainer.addEventListener('drop', function (e) {
        e.preventDefault();
        messageInputContainer.classList.remove('drag-over');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            uploadFile(files[0]);
        }
    });
}

// Upload file
async function uploadFile(file) {
    const maxSize = 50 * 1024 * 1024; // 50MB limit

    if (file.size > maxSize) {
        alert('File size must be less than 50MB');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('room_id', currentRoom);
    formData.append('anonymous_id', anonymousId);

    if (replyToMessage) {
        formData.append('parent_id', replyToMessage.id);
    }

    try {
        const response = await fetch('/api/upload_file', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            // Clear reply state
            clearReplyState();
            // Force reload messages to show the new one
            lastMessageId = null;
            loadMessages();
        } else {
            alert('Error uploading file: ' + result.error);
        }
    } catch (error) {
        console.error('Error uploading file:', error);
        alert('Error uploading file. Please try again.');
    }
}

// Setup message sending
function setupMessageSending() {
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');

    function sendMessage() {
        const message = messageInput.value.trim();
        if (message === '' || !currentRoom) return;

        // If we're replying to a message, include the parent_id
        const parentId = replyToMessage ? replyToMessage.id : null;

        // Disable input while sending
        messageInput.disabled = true;
        sendButton.disabled = true;

        fetch('/api/send_message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                room_id: currentRoom,
                message: message,
                anonymous_id: anonymousId,
                parent_id: parentId
            })
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    messageInput.value = '';
                    clearReplyState();
                    // Force reload messages to show the new one
                    lastMessageId = null;
                    loadMessages();
                } else {
                    console.error('Error sending message:', data.error);
                }
            })
            .catch(error => {
                console.error('Error sending message:', error);
            })
            .finally(() => {
                // Re-enable input
                messageInput.disabled = false;
                sendButton.disabled = false;
                messageInput.focus();
            });
    }

    sendButton.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
}

// Setup reply modal
function setupReplyModal() {
    const modal = document.getElementById('reply-modal');
    const sendButton = document.getElementById('send-reply');
    const cancelButton = document.getElementById('cancel-reply');
    const replyInput = document.getElementById('reply-input');
    const originalMessage = document.getElementById('original-message');

    // Show reply modal
    window.showReplyModal = function (messageId, messageText, sender, message) {
        replyToMessage = message;
        originalMessage.innerHTML = `
            <strong>${sender}:</strong> ${messageText}
        `;
        modal.style.display = 'flex';
        replyInput.value = '';
        replyInput.focus();

        // Show reply indicator in input
        showReplyIndicator(message);
    }

    // Hide reply modal
    function hideReplyModal() {
        modal.style.display = 'none';
        clearReplyState();
    }

    // Send reply
    sendButton.addEventListener('click', function () {
        const reply = replyInput.value.trim();
        if (reply === '') return;

        // Send the message (it will use the replyToMessage as parent_id)
        const messageInput = document.getElementById('message-input');
        messageInput.value = reply;

        // Trigger sending
        document.getElementById('send-button').click();

        hideReplyModal();
    });

    // Cancel button
    cancelButton.addEventListener('click', hideReplyModal);

    // Allow pressing Enter to submit
    replyInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            sendButton.click();
        }
    });
}

// Set reply to message
function setReplyToMessage(message) {
    replyToMessage = message;
    showReplyIndicator(message);
}

// Show reply indicator in input
function showReplyIndicator(message) {
    const messageInput = document.getElementById('message-input');
    const replyIndicator = document.createElement('div');
    replyIndicator.className = 'reply-indicator-input';
    replyIndicator.innerHTML = `
        <div class="reply-indicator-content">
            <i class="fas fa-reply"></i>
            <span>Replying to ${message.anonymous_id}: ${message.text || message.file_name || 'File'}</span>
            <button type="button" class="cancel-reply-btn" onclick="clearReplyState()">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;

    // Insert before the input
    const inputContainer = messageInput.parentElement;
    inputContainer.insertBefore(replyIndicator, messageInput);

    // Focus on input
    messageInput.focus();
}

// Clear reply state
function clearReplyState() {
    replyToMessage = null;
    const replyIndicator = document.querySelector('.reply-indicator-input');
    if (replyIndicator) {
        replyIndicator.remove();
    }
}

// Open file viewer
window.openFileViewer = function (fileUrl, fileType, fileName) {
    if (fileType === 'image') {
        // Open image in new tab
        window.open(fileUrl, '_blank');
    } else if (fileType === 'document') {
        // Download document
        const link = document.createElement('a');
        link.href = fileUrl;
        link.download = fileName || 'document';
        link.click();
    }
}

// Setup navigation
function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            const href = this.getAttribute('href');
            window.location.href = href;
        });
    });
}