// ========== KONFIGURASI FIREBASE ==========
const firebaseConfig = {
    apiKey: "AIzaSyCmV11WPvCTOamdSoZah48WR4r4dy-Ewn4",
    authDomain: "immychat.firebaseapp.com",
    databaseURL: "https://immychat-default-rtdb.firebaseio.com",
    projectId: "immychat",
    storageBucket: "immychat.firebasestorage.app",
    messagingSenderId: "1012031553152",
    appId: "1:1012031553152:web:0d4439d10b73021240b065",
    measurementId: "G-2NY11WY8J7"
};

// Inisialisasi Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// State Aplikasi
let currentUser = null;
let currentRoom = null;
let isAdmin = false;
let peer = null;

let localStreamInstance = null;
window.activeCalls = []; // Menyimpan semua koneksi telepon grup aktif

// Elemen DOM
const toast = document.getElementById('toast');
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const usernameInput = document.getElementById('username-input');
const currentUserDisplay = document.getElementById('current-user-display');
const adminPanel = document.getElementById('admin-panel');
const newRoomInput = document.getElementById('new-room-input');
const createRoomBtn = document.getElementById('create-room-btn');
const roomList = document.getElementById('room-list');
const activeRoomName = document.getElementById('active-room-name');
const chatMessages = document.getElementById('chat-messages');
const chatInputContainer = document.getElementById('chat-input-container');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const callControls = document.getElementById('call-controls');
const voiceCallBtn = document.getElementById('voice-call-btn');
const videoCallBtn = document.getElementById('video-call-btn');
const logoutBtn = document.getElementById('logout-btn');

const attachBtn = document.getElementById('attach-btn');
const fileInput = document.getElementById('file-input');

// Video Elements
const callOverlay = document.getElementById('call-overlay');
const callStatus = document.getElementById('call-status');
const localVideo = document.getElementById('local-video');
const endCallBtn = document.getElementById('end-call-btn');
const shareScreenBtn = document.getElementById('share-screen-btn');


// ========== HELPER TOAST ==========
function showToast(msg) {
    toast.innerText = msg;
    toast.classList.remove('hidden');
    setTimeout(() => { toast.classList.add('hidden'); }, 3000);
}

// ========== LOGIN & INIT ==========
window.onload = () => {
    const savedUser = localStorage.getItem('nothin_user');
    if (savedUser) {
        login(savedUser);
    }
};

usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && usernameInput.value.trim() !== '') {
        login(usernameInput.value.trim());
    }
});

function login(username) {
    currentUser = username;
    isAdmin = (username === 'admin123');
    localStorage.setItem('nothin_user', username);
    
    loginScreen.classList.remove('active');
    loginScreen.classList.add('hidden');
    appScreen.classList.remove('hidden');
    appScreen.classList.add('active');

    currentUserDisplay.innerText = isAdmin ? '[ ADMIN ]' : `[ ${username} ]`;
    if (isAdmin) {
        adminPanel.classList.remove('hidden');
    }

    initPeerJS();
    listenToRooms();
}

logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('nothin_user');
    location.reload();
});

// ========== ROOMS ==========
createRoomBtn.addEventListener('click', () => {
    if (!isAdmin) return;
    const roomName = newRoomInput.value.trim();
    if (roomName) {
        const roomId = roomName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        db.ref('rooms/' + roomId).set({
            name: roomName,
            createdBy: currentUser,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
        newRoomInput.value = '';
        showToast('Room created.');
    }
});

function listenToRooms() {
    db.ref('rooms').on('value', (snapshot) => {
        roomList.innerHTML = '';
        const rooms = snapshot.val();
        if (rooms) {
            Object.keys(rooms).forEach(roomId => {
                const room = rooms[roomId];
                const li = document.createElement('li');
                li.innerText = room.name;
                li.onclick = () => selectRoom(roomId, room.name);
                if (currentRoom === roomId) li.classList.add('active-room');
                roomList.appendChild(li);
            });
        }
    });
}

function selectRoom(roomId, roomName) {
    currentRoom = roomId;
    activeRoomName.innerText = roomName;
    chatInputContainer.classList.remove('hidden');
    callControls.classList.remove('hidden');
    
    Array.from(roomList.children).forEach(child => {
        child.classList.remove('active-room');
        if (child.innerText === roomName) child.classList.add('active-room');
    });

    listenToMessages(roomId);
}

// ========== MESSAGES ==========
function listenToMessages(roomId) {
    db.ref('messages/' + roomId).on('value', (snapshot) => {
        chatMessages.innerHTML = '';
        const msgs = snapshot.val();
        if (msgs) {
            Object.values(msgs).forEach(msg => {
                const isSelf = msg.sender === currentUser;
                const div = document.createElement('div');
                div.className = `message-box ${isSelf ? 'self' : 'other'}`;
                
                const senderDiv = document.createElement('div');
                senderDiv.className = 'message-sender';
                senderDiv.innerText = msg.sender;
                div.appendChild(senderDiv);

                // Teks biasa (jika ada)
                if (msg.text) {
                    const textDiv = document.createElement('div');
                    textDiv.className = 'message-text';
                    textDiv.innerText = msg.text;
                    div.appendChild(textDiv);
                }

                // Render lampiran (Attachment)
                if (msg.type === 'image') {
                    const img = document.createElement('img');
                    img.src = msg.fileUrl;
                    img.className = 'message-img';
                    img.onclick = () => window.open(msg.fileUrl, '_blank');
                    div.appendChild(img);
                } else if (msg.type === 'video') {
                    const vid = document.createElement('video');
                    vid.src = msg.fileUrl;
                    vid.className = 'message-video';
                    vid.controls = true;
                    div.appendChild(vid);
                } else if (msg.type === 'file' || msg.type === 'audio') {
                    const link = document.createElement('a');
                    link.href = msg.fileUrl;
                    link.className = 'message-file';
                    link.innerText = `📁 Download: ${msg.fileName || 'File'}`;
                    link.target = "_blank";
                    link.download = msg.fileName;
                    div.appendChild(link);
                }
                
                // Render Undangan Telepon (Call Invite)
                else if (msg.type === 'call_invite') {
                    const inviteDiv = document.createElement('div');
                    inviteDiv.style.background = 'rgba(255,255,255,0.1)';
                    inviteDiv.style.padding = '12px';
                    inviteDiv.style.borderRadius = '8px';
                    inviteDiv.style.marginTop = '8px';
                    inviteDiv.style.border = '1px solid var(--border)';
                    
                    inviteDiv.innerHTML = `
                        <strong style="color:var(--accent); font-size:1rem;">📞 ${msg.isVideo ? 'Video' : 'Voice'} Call</strong><br>
                        <span style="font-size:0.85rem">Started by ${msg.sender}</span><br>
                    `;
                    
                    if (msg.sender !== currentUser) {
                        const joinBtn = document.createElement('button');
                        joinBtn.innerText = "JOIN CALL";
                        joinBtn.className = "minimal-btn";
                        joinBtn.style.marginTop = "10px";
                        joinBtn.style.background = "var(--accent)";
                        joinBtn.style.color = "var(--bg-color)";
                        joinBtn.style.fontWeight = "bold";
                        joinBtn.onclick = () => joinCall(msg.peerId, msg.isVideo);
                        inviteDiv.appendChild(joinBtn);
                    } else {
                        const info = document.createElement('span');
                        info.innerText = " (You started this call)";
                        info.style.fontSize = '0.75rem';
                        info.style.color = 'var(--dim-text)';
                        inviteDiv.appendChild(info);
                    }
                    div.appendChild(inviteDiv);
                }

                chatMessages.appendChild(div);
            });
            chatMessages.scrollTop = chatMessages.scrollHeight;
        } else {
            chatMessages.innerHTML = '<div class="placeholder-text">no messages yet.</div>';
        }
    });
}

function sendMessage() {
    const text = messageInput.value.trim();
    if (text && currentRoom) {
        db.ref('messages/' + currentRoom).push({
            sender: currentUser,
            text: text,
            type: 'text',
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
        messageInput.value = '';
    }
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// ========== LAMPIRAN (FILE/GAMBAR/VIDEO) ==========
attachBtn.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file || !currentRoom) return;

    if (file.size > 3 * 1024 * 1024) {
        showToast('File terlalu besar! Maksimal 3MB untuk versi gratis tanpa Storage.');
        fileInput.value = '';
        return;
    }

    const fileName = file.name;
    showToast('Processing file...');

    const reader = new FileReader();
    reader.onload = function(event) {
        const base64Data = event.target.result;
        let msgType = 'file';
        if (file.type.startsWith('image/')) msgType = 'image';
        else if (file.type.startsWith('video/')) msgType = 'video';
        else if (file.type.startsWith('audio/')) msgType = 'audio';

        db.ref('messages/' + currentRoom).push({
            sender: currentUser,
            text: '',
            type: msgType,
            fileUrl: base64Data,
            fileName: fileName,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        }).then(() => {
            showToast('File sent!');
        }).catch(err => {
            console.error('Failed to send file:', err);
            showToast('Gagal mengirim file!');
        });
    };
    reader.readAsDataURL(file);
    fileInput.value = '';
});

// ========== PEERJS (GROUP CALLS) ==========
function initPeerJS() {
    // Tambahkan angka random agar ID selalu unik di setiap tab/perangkat
    const randomSuffix = Math.floor(Math.random() * 10000);
    peer = new Peer(currentUser.replace(/[^a-zA-Z0-9]/g, '') + '_' + randomSuffix); 
    
    peer.on('call', (call) => {
        // Otomatis menjawab jika ada yang bergabung ke panggilan kita
        if (localStreamInstance) {
            call.answer(localStreamInstance);
            handleCall(call);
        } else {
            // Fallback jika kita belum menyalakan kamera
            navigator.mediaDevices.getUserMedia({video: true, audio: true})
            .then((stream) => {
                localStreamInstance = stream;
                localVideo.srcObject = stream;
                call.answer(stream);
                handleCall(call);
            }).catch(err => {
                showToast('Camera/Mic permission denied');
            });
        }
    });
}

function startCall(isVideo) {
    if (!currentRoom) { showToast("Select a room first!"); return; }

    navigator.mediaDevices.getUserMedia({video: isVideo, audio: true})
    .then((stream) => {
        localStreamInstance = stream;
        localVideo.srcObject = stream;
        
        callOverlay.classList.remove('hidden');
        callStatus.innerText = "WAITING FOR OTHERS TO JOIN...";
        
        // Broadcast undangan ke chat room!
        db.ref('messages/' + currentRoom).push({
            sender: currentUser,
            text: '',
            type: 'call_invite',
            isVideo: isVideo,
            peerId: peer.id, // Berikan ID peer kita
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });

    }).catch(err => {
        console.error(err);
        showToast('Camera/Mic permission denied');
    });
}

function joinCall(targetPeerId, isVideo) {
    navigator.mediaDevices.getUserMedia({video: isVideo, audio: true})
    .then((stream) => {
        localStreamInstance = stream;
        localVideo.srcObject = stream;
        
        callOverlay.classList.remove('hidden');
        callStatus.innerText = "CONNECTING...";
        
        // Memanggil si pembuat room/undangan
        const call = peer.call(targetPeerId, stream);
        handleCall(call);
    }).catch(err => {
        console.error(err);
        showToast('Camera/Mic permission denied');
    });
}

function handleCall(call) {
    window.activeCalls.push(call);
    callOverlay.classList.remove('hidden');
    callStatus.innerText = "IN CALL";
    
    call.on('stream', (remoteStream) => {
        // Buat tag video baru secara dinamis untuk siapapun yang join
        let vid = document.getElementById('vid_' + call.peer);
        if (!vid) {
            vid = document.createElement('video');
            vid.id = 'vid_' + call.peer;
            vid.autoplay = true;
            vid.playsInline = true;
            document.querySelector('.video-grid').appendChild(vid);
        }
        vid.srcObject = remoteStream;
    });

    call.on('close', () => {
        let vid = document.getElementById('vid_' + call.peer);
        if (vid) vid.remove();
    });
}

function endCall() {
    // Matikan semua koneksi
    window.activeCalls.forEach(c => c.close());
    window.activeCalls = [];
    
    callOverlay.classList.add('hidden');
    
    // Matikan kamera lokal
    if (localStreamInstance) {
        localStreamInstance.getTracks().forEach(track => track.stop());
        localStreamInstance = null;
    }
    localVideo.srcObject = null;
    
    // Hapus semua video orang lain dari layar
    const grid = document.querySelector('.video-grid');
    Array.from(grid.children).forEach(child => {
        if (child.id !== 'local-video') {
            child.remove();
        }
    });
}

videoCallBtn.addEventListener('click', () => startCall(true));
voiceCallBtn.addEventListener('click', () => startCall(false));
endCallBtn.addEventListener('click', endCall);

// Fitur Share Screen
shareScreenBtn.addEventListener('click', async () => {
    try {
        // Meminta izin kepada pengguna untuk membagikan layarnya
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        
        // Tampilkan layar di video lokal kita sendiri (agar kita bisa melihat apa yang dibagikan)
        localVideo.srcObject = screenStream;

        // Ganti *track* video yang sedang dikirim ke semua lawan bicara yang terhubung
        window.activeCalls.forEach(call => {
            const sender = call.peerConnection.getSenders().find(s => s.track.kind === 'video');
            if (sender) {
                sender.replaceTrack(screenTrack);
            }
        });

        // Event ketika pengguna menekan tombol "Stop Sharing" dari popup browser bawaan
        screenTrack.onended = async () => {
            try {
                // Nyalakan ulang kamera depan/webcam
                const camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                localStreamInstance = camStream;
                localVideo.srcObject = camStream;
                const camTrack = camStream.getVideoTracks()[0];
                
                // Kirim ulang wajah ke semua orang
                window.activeCalls.forEach(call => {
                    const sender = call.peerConnection.getSenders().find(s => s.track.kind === 'video');
                    if (sender) {
                        sender.replaceTrack(camTrack);
                    }
                });
            } catch (e) {
                console.error("Gagal mengembalikan kamera setelah share screen:", e);
                showToast("Share screen dihentikan (Kamera dimatikan).");
            }
        };
    } catch (err) {
        console.error("Gagal membagikan layar:", err);
        showToast("Share screen dibatalkan atau tidak diizinkan oleh browser.");
    }
});
