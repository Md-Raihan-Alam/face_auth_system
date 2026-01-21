import React, { useState, useRef, useEffect } from "react";
import {
  Camera,
  Lock,
  User,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  UserPlus,
  LogIn,
  Database,
} from "lucide-react";

const FaceAuthSystem = () => {
  const [mode, setMode] = useState("enrollment");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [userCount, setUserCount] = useState(0);
  const [serverStatus, setServerStatus] = useState("checking");

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const API_URL = "http://localhost:3001/api";
  const fetchUserCount = async () => {
    try {
      const response = await fetch(`${API_URL}/users/count`);
      const data = await response.json();
      setUserCount(data.count);
    } catch (err) {
      console.error("Failed to fetch user count:", err);
    }
  };
  const checkServerStatus = async () => {
    try {
      const response = await fetch(`${API_URL}/health`);
      if (response.ok) {
        setServerStatus("online");
        fetchUserCount();
      } else {
        setServerStatus("offline");
      }
    } catch (err) {
      setServerStatus("offline");
    }
  };

  // Check server status
  useEffect(() => {
    checkServerStatus();
  }, []);

  const extractFaceEmbedding = (imageData) => {
    const pixels = imageData.data;
    const embedding = new Float32Array(128);

    for (let i = 0; i < 128; i++) {
      let sum = 0;
      const step = Math.floor(pixels.length / 128);
      for (let j = i * step; j < (i + 1) * step && j < pixels.length; j += 4) {
        sum += pixels[j] + pixels[j + 1] + pixels[j + 2];
      }
      embedding[i] = sum / (step / 4) / 765;
    }

    return Array.from(embedding);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsCameraOn(true);
      }
    } catch (err) {
      setMessage("Failed to access camera: " + err.message);
      setMessageType("error");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraOn(false);
  };

  const captureImage = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);

    const imageData = canvas.toDataURL("image/jpeg");
    setCapturedImage(imageData);
    stopCamera();
  };

  const retakePhoto = () => {
    setCapturedImage(null);
    startCamera();
  };

  const handleEnrollment = async () => {
    if (serverStatus !== "online") {
      setMessage("Server is offline. Please start the backend server.");
      setMessageType("error");
      return;
    }

    if (!username || !password || !capturedImage) {
      setMessage("Please provide username, password, and capture your face");
      setMessageType("error");
      return;
    }

    try {
      setMessage("Processing enrollment...");
      setMessageType("");

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const embedding = extractFaceEmbedding(imageData);

      const response = await fetch(`${API_URL}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          faceEmbedding: embedding,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(`✓ ${data.message} (Total users: ${data.userCount})`);
        setMessageType("success");
        setUserCount(data.userCount);

        setTimeout(() => {
          setUsername("");
          setPassword("");
          setCapturedImage(null);
          setMode("login");
        }, 2000);
      } else {
        setMessage("Enrollment failed: " + data.error);
        setMessageType("error");
      }
    } catch (err) {
      setMessage("Enrollment failed: " + err.message);
      setMessageType("error");
    }
  };

  const handleLogin = async () => {
    if (serverStatus !== "online") {
      setMessage("Server is offline. Please start the backend server.");
      setMessageType("error");
      return;
    }

    if (!username || !password || !capturedImage) {
      setMessage("Please provide username, password, and capture your face");
      setMessageType("error");
      return;
    }

    try {
      setMessage("Authenticating...");
      setMessageType("");

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const embedding = extractFaceEmbedding(imageData);

      const response = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          faceEmbedding: embedding,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(
          `✓ ${data.message} (Face match: ${(data.similarity * 100).toFixed(
            1
          )}%)`
        );
        setMessageType("success");

        setTimeout(() => {
          setUsername("");
          setPassword("");
          setCapturedImage(null);
        }, 3000);
      } else {
        setMessage("Login failed: " + data.error);
        setMessageType("error");
      }
    } catch (err) {
      setMessage("Login failed: " + err.message);
      setMessageType("error");
    }
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 rounded-full mb-4">
              <Lock className="w-8 h-8 text-indigo-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">
              Face Recognition Auth
            </h1>
            <p className="text-gray-600">
              Secure authentication with facial recognition
            </p>
          </div>

          {/* Server Status */}
          <div
            className={`mb-6 p-4 rounded-lg border flex items-center justify-between ${
              serverStatus === "online"
                ? "bg-green-50 border-green-200"
                : "bg-red-50 border-red-200"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-3 h-3 rounded-full ${
                  serverStatus === "online"
                    ? "bg-green-500 animate-pulse"
                    : "bg-red-500"
                }`}
              />
              <span
                className={`font-medium ${
                  serverStatus === "online" ? "text-green-800" : "text-red-800"
                }`}
              >
                {serverStatus === "online" ? "Server Online" : "Server Offline"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-gray-600" />
              <span className="text-sm text-gray-700">
                {userCount} user{userCount !== 1 ? "s" : ""}
              </span>
              <button
                onClick={checkServerStatus}
                className="ml-2 px-3 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>

          {serverStatus === "offline" && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                <strong>Backend server not running.</strong> Please start the
                server with:{" "}
                <code className="bg-yellow-100 px-2 py-1 rounded">
                  node server.js
                </code>
              </p>
            </div>
          )}

          {/* Mode Toggle */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => {
                setMode("enrollment");
                setMessage("");
                setCapturedImage(null);
              }}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
                mode === "enrollment"
                  ? "bg-indigo-600 text-white shadow-md"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <UserPlus className="w-5 h-5 inline mr-2" />
              Enrollment
            </button>
            <button
              onClick={() => {
                setMode("login");
                setMessage("");
                setCapturedImage(null);
              }}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
                mode === "login"
                  ? "bg-indigo-600 text-white shadow-md"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <LogIn className="w-5 h-5 inline mr-2" />
              Login
            </button>
          </div>

          {/* Form */}
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User className="w-4 h-4 inline mr-1" />
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Enter username"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Lock className="w-4 h-4 inline mr-1" />
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Enter password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Camera Section */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Camera className="w-4 h-4 inline mr-1" />
              Face Capture
            </label>

            <div className="bg-gray-100 rounded-lg p-4">
              {!capturedImage ? (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className={`w-full rounded-lg ${
                      isCameraOn ? "" : "hidden"
                    }`}
                  />
                  {!isCameraOn && (
                    <div className="text-center py-12">
                      <Camera className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600 mb-4">Camera is off</p>
                    </div>
                  )}
                  <div className="flex gap-2 mt-4">
                    {!isCameraOn ? (
                      <button
                        onClick={startCamera}
                        className="flex-1 bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors"
                      >
                        Start Camera
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={captureImage}
                          className="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors"
                        >
                          Capture Photo
                        </button>
                        <button
                          onClick={stopCamera}
                          className="flex-1 bg-gray-600 text-white py-2 px-4 rounded-lg hover:bg-gray-700 transition-colors"
                        >
                          Stop Camera
                        </button>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <img
                    src={capturedImage}
                    alt="Captured"
                    className="w-full rounded-lg"
                  />
                  <button
                    onClick={retakePhoto}
                    className="w-full bg-gray-600 text-white py-2 px-4 rounded-lg hover:bg-gray-700 transition-colors mt-4"
                  >
                    Retake Photo
                  </button>
                </>
              )}
            </div>
          </div>

          <canvas ref={canvasRef} className="hidden" />

          {/* Submit Button */}
          <button
            onClick={mode === "enrollment" ? handleEnrollment : handleLogin}
            disabled={serverStatus !== "online"}
            className={`w-full py-3 px-6 rounded-lg font-medium transition-colors shadow-md ${
              serverStatus === "online"
                ? "bg-indigo-600 text-white hover:bg-indigo-700"
                : "bg-gray-400 text-gray-200 cursor-not-allowed"
            }`}
          >
            {mode === "enrollment" ? "Complete Enrollment" : "Login"}
          </button>

          {/* Message Display */}
          {message && (
            <div
              className={`mt-4 p-4 rounded-lg flex items-center gap-2 ${
                messageType === "success"
                  ? "bg-green-50 text-green-800 border border-green-200"
                  : messageType === "error"
                  ? "bg-red-50 text-red-800 border border-red-200"
                  : "bg-blue-50 text-blue-800 border border-blue-200"
              }`}
            >
              {messageType === "success" && <CheckCircle className="w-5 h-5" />}
              {messageType === "error" && <XCircle className="w-5 h-5" />}
              <span className="text-sm">{message}</span>
            </div>
          )}

          {/* Info */}
          <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-800">
              <strong>File Storage:</strong> User data is stored in{" "}
              <code>database/users.json</code> and RSA keys in{" "}
              <code>database/rsa_keys.json</code>. All data is encrypted and
              persists across sessions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FaceAuthSystem;
