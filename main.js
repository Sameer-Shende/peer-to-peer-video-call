let APP_ID = "e1973d5313b245bc975d625333ed047e"

let token = null;
let uid = String(Math.floor(Math.random() * 10000))

let client;
let channel;

let queryString = window.location.search
let urlParams = new URLSearchParams(queryString)
let roomId = urlParams.get('room')

if(!roomId){
    window.location = 'lobby.html'
}

let localStream;
let remoteStream;
let peerConnection;

let pendingICECandidates = []; // Store ICE candidates if remote description isn't set yet

const servers = {
    iceServers:[
        {
            urls:['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302']
        }
    ]
}

let constraints = {
    video:{
        width:{min:640, ideal:1920, max:1920},
        height:{min:480, ideal:1080, max:1080},
    },
    audio:true
}

let init = async () => {
    client = await AgoraRTM.createInstance(APP_ID)
    await client.login({uid, token})

    channel = client.createChannel(roomId)
    await channel.join()

    channel.on('MemberJoined', handleUserJoined)
    channel.on('MemberLeft', handleUserLeft)

    client.on('MessageFromPeer', handleMessageFromPeer)

    localStream = await navigator.mediaDevices.getUserMedia(constraints)
    document.getElementById('user-1').srcObject = localStream
    document.getElementById('user-1').play()
}

let handleUserLeft = (MemberId) => {
    document.getElementById('user-2').style.display = 'none'
    document.getElementById('user-1').classList.remove('smallFrame')
}

let handleMessageFromPeer = async (message, MemberId) => {
    message = JSON.parse(message.text)

    if(message.type === 'offer'){
        await createAnswer(MemberId, message.offer)
    }

    if(message.type === 'answer'){
        await addAnswer(message.answer)
    }

    if(message.type === 'candidate'){
        if(peerConnection && peerConnection.remoteDescription) {
            await peerConnection.addIceCandidate(message.candidate)
        } else {
            pendingICECandidates.push(message.candidate) // Store candidate if remote description isn't set
        }
    }
}

let handleUserJoined = async (MemberId) => {
    console.log('A new user joined the channel:', MemberId)
    await createOffer(MemberId)
}

let createPeerConnection = async (MemberId) => {
    peerConnection = new RTCPeerConnection(servers)

    remoteStream = new MediaStream()
    document.getElementById('user-2').srcObject = remoteStream
    document.getElementById('user-2').style.display = 'block'
    document.getElementById('user-2').play()

    document.getElementById('user-1').classList.add('smallFrame')

    if(!localStream){
        localStream = await navigator.mediaDevices.getUserMedia({video:true, audio:true})
        document.getElementById('user-1').srcObject = localStream
        document.getElementById('user-1').play()
    }

    localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream)
    })

    peerConnection.ontrack = (event) => {
        console.log('Remote track received:', event)
        event.streams[0].getTracks().forEach((track) => {
            remoteStream.addTrack(track)
        })
    }

    peerConnection.onicecandidate = async (event) => {
        if(event.candidate){
            await client.sendMessageToPeer({text:JSON.stringify({'type':'candidate', 'candidate':event.candidate})}, MemberId)
        }
    }
}

let createOffer = async (MemberId) => {
    await createPeerConnection(MemberId)

    let offer = await peerConnection.createOffer()
    await peerConnection.setLocalDescription(offer)

    await client.sendMessageToPeer({text:JSON.stringify({'type':'offer', 'offer':offer})}, MemberId)
}

let createAnswer = async (MemberId, offer) => {
    await createPeerConnection(MemberId)

    await peerConnection.setRemoteDescription(offer)

    let answer = await peerConnection.createAnswer()
    await peerConnection.setLocalDescription(answer)

    // Apply any pending ICE candidates
    if (pendingICECandidates.length > 0) {
        for (let candidate of pendingICECandidates) {
            await peerConnection.addIceCandidate(candidate)
        }
        pendingICECandidates = []
    }

    await client.sendMessageToPeer({text:JSON.stringify({'type':'answer', 'answer':answer})}, MemberId)
}

let addAnswer = async (answer) => {
    if(!peerConnection.currentRemoteDescription){
        await peerConnection.setRemoteDescription(answer)

        // Apply any pending ICE candidates
        if (pendingICECandidates.length > 0) {
            for (let candidate of pendingICECandidates) {
                await peerConnection.addIceCandidate(candidate)
            }
            pendingICECandidates = []
        }
    }
}

let leaveChannel = async () => {
    await channel.leave()
    await client.logout()
}

let toggleCamera = async () => {
    let videoTrack = localStream.getVideoTracks()[0]

    if(videoTrack){
        videoTrack.enabled = !videoTrack.enabled
        document.getElementById('camera-btn').style.backgroundColor = videoTrack.enabled ? 'rgb(179, 102, 249, .9)' : 'rgb(255, 80, 80)'
    }
}

let toggleMic = async () => {
    let audioTrack = localStream.getAudioTracks()[0]

    if(audioTrack){
        audioTrack.enabled = !audioTrack.enabled
        document.getElementById('mic-btn').style.backgroundColor = audioTrack.enabled ? 'rgb(179, 102, 249, .9)' : 'rgb(255, 80, 80)'
    }
}

window.addEventListener('beforeunload', leaveChannel)

document.getElementById('camera-btn').addEventListener('click', toggleCamera)
document.getElementById('mic-btn').addEventListener('click', toggleMic)

init()
