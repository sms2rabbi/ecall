import React, { useEffect, useState, useRef } from "react";
import { HashRouter as Router, Routes, Route, useNavigate } from "react-router-dom";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import AgoraRTC from "agora-rtc-sdk-ng";

// --- Firebase Config ---
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "ecall.firebaseapp.com",
  projectId: "ecall",
  storageBucket: "ecall.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Agora Config ---
const agoraAppId = "f77c842c47f44108852da440df031539";

// --- Login Component ---
function Login() {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [confirmResult, setConfirmResult] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    onAuthStateChanged(auth, (user) => {
      if (user) navigate("/home");
    });
  }, [navigate]);

  const sendOtp = () => {
    window.recaptchaVerifier = new RecaptchaVerifier(
      "recaptcha-container",
      { size: "invisible" },
      auth
    );
    signInWithPhoneNumber(auth, "+88" + phone, window.recaptchaVerifier)
      .then((confirmationResult) => setConfirmResult(confirmationResult))
      .catch((err) => alert(err.message));
  };

  const verifyOtp = () => {
    if (!confirmResult) return;
    confirmResult
      .confirm(otp)
      .then(() => navigate("/home"))
      .catch(() => alert("Invalid OTP"));
  };

  return (
    <div style={{ maxWidth: 400, margin: "auto", padding: 20 }}>
      <h2>Ecall Login</h2>
      <input
        type="tel"
        placeholder="Enter phone (without +88)"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        style={{ width: "100%", padding: 8, margin: "8px 0" }}
      />
      {!confirmResult ? (
        <button onClick={sendOtp} style={buttonStyle}>
          Send OTP
        </button>
      ) : (
        <>
          <input
            type="number"
            placeholder="Enter OTP"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            style={{ width: "100%", padding: 8, margin: "8px 0" }}
          />
          <button onClick={verifyOtp} style={buttonStyle}>
            Verify OTP
          </button>
        </>
      )}
      <div id="recaptcha-container"></div>
    </div>
  );
}

const buttonStyle = {
  width: "100%",
  padding: 10,
  backgroundColor: "#1f2937",
  color: "white",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
};

// --- Chat Message Component ---
function Message({ sender, text, currentUser }) {
  const isMe = sender === currentUser;
  return (
    <div
      style={{
        textAlign: isMe ? "right" : "left",
        margin: "4px 0",
      }}
    >
      <span
        style={{
          display: "inline-block",
          padding: "6px 12px",
          borderRadius: 16,
          backgroundColor: isMe ? "#4ade80" : "#e5e7eb",
          color: isMe ? "#065f46" : "#111827",
          maxWidth: "70%",
          wordWrap: "break-word",
        }}
      >
        {text}
      </span>
      <br />
      {!isMe && (
        <small style={{ fontSize: 10, color: "#6b7280" }}>{sender}</small>
      )}
    </div>
  );
}

// --- ChatRoom Component ---
function ChatRoom({ user }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");

  useEffect(() => {
    const q = query(collection(db, "messages"), orderBy("createdAt"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });
    return unsubscribe;
  }, []);

  const sendMessage = async () => {
    if (!input.trim()) return;
    await addDoc(collection(db, "messages"), {
      text: input,
      sender: user.phoneNumber,
      createdAt: serverTimestamp(),
    });
    setInput("");
  };

  return (
    <div
      style={{
        border: "1px solid #d1d5db",
        padding: 12,
        borderRadius: 8,
        maxHeight: 300,
        overflowY: "auto",
        marginBottom: 12,
      }}
    >
      {messages.map(({ id, sender, text }) => (
        <Message key={id} sender={sender} text={text} currentUser={user.phoneNumber} />
      ))}
      <div style={{ display: "flex", marginTop: 10 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          style={{ flexGrow: 1, padding: 8, borderRadius: 4, border: "1px solid #ccc" }}
          placeholder="Type your message..."
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
        />
        <button onClick={sendMessage} style={{ ...buttonStyle, width: 80, marginLeft: 8 }}>
          Send
        </button>
      </div>
    </div>
  );
}

// --- VideoCall Component ---
function VideoCall() {
  const [joined, setJoined] = useState(false);
  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const clientRef = useRef(null);
  const localTracksRef = useRef([]);

  const joinCall = async () => {
    if (joined) return;

    const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
    clientRef.current = client;

    client.on("user-published", async (user, mediaType) => {
      await client.subscribe(user, mediaType);
      if (mediaType === "video") {
        const remoteVideoTrack = user.videoTrack;
        remoteVideoTrack.play(remoteVideoRef.current);
      }
      if (mediaType === "audio") {
        const remoteAudioTrack = user.audioTrack;
        remoteAudioTrack.play();
      }
    });

    await client.join(agoraAppId, "ecall-room", null, null);
    const [microphoneTrack, cameraTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
    localTracksRef.current = [microphoneTrack, cameraTrack];
    cameraTrack.play(localVideoRef.current);

    await client.publish(localTracksRef.current);

    setJoined(true);
  };

  const leaveCall = async () => {
    if (!joined) return;

    localTracksRef.current.forEach((track) => track.stop && track.stop());
    localTracksRef.current.forEach((track) => track.close && track.close());

    await clientRef.current.leave();
    clientRef.current.removeAllListeners();
    setJoined(false);
  };

  return (
    <div style={{ marginTop: 20 }}>
      <h3>Video Call</h3>
      <div style={{ display: "flex", gap: 10 }}>
        <div>
          <p>Local</p>
          <div
            ref={localVideoRef}
            style={{ width: 160, height: 120, backgroundColor: "#000" }}
          ></div>
        </div>
        <div>
          <p>Remote</p>
          <div
            ref={remoteVideoRef}
            style={{ width: 160, height: 120, backgroundColor: "#000" }}
          ></div>
        </div>
      </div>
      {!joined ? (
        <button onClick={joinCall} style={{ ...buttonStyle, marginTop: 10 }}>
          Join Call
        </button>
      ) : (
        <button onClick={leaveCall} style={{ ...buttonStyle, marginTop: 10, backgroundColor: "#dc2626" }}>
          Leave Call
        </button>
      )}
    </div>
  );
}

// --- Home Component ---
function Home() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        navigate("/");
      } else {
        setUser(u);
      }
    });
    return unsub;
  }, [navigate]);

  const handleLogout = () => {
    signOut(auth);
  };

  if (!user) return null;

  return (
    <div style={{ maxWidth: 600, margin: "auto", padding: 20 }}>
      <h2>Welcome, {user.phoneNumber}</h2>
      <button onClick={handleLogout} style={{ ...buttonStyle, marginBottom: 20 }}>
        Logout
      </button>
      <ChatRoom user={user} />
      <VideoCall />
    </
