// server.js - Node.js Backend with File Storage
const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
const PORT = 3001;
const DB_FILE = path.join(__dirname, "database", "users.json");
const KEYS_FILE = path.join(__dirname, "database", "rsa_keys.json");

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Ensure database directory exists
async function initDatabase() {
  const dbDir = path.join(__dirname, "database");
  try {
    await fs.mkdir(dbDir, { recursive: true });

    // Check if files exist, if not create them
    try {
      await fs.access(DB_FILE);
    } catch {
      await fs.writeFile(DB_FILE, JSON.stringify({ users: {} }, null, 2));
      console.log("Created users.json");
    }

    try {
      await fs.access(KEYS_FILE);
    } catch {
      // Generate RSA keys if not exists
      const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });

      await fs.writeFile(
        KEYS_FILE,
        JSON.stringify(
          {
            publicKey,
            privateKey,
            createdAt: new Date().toISOString(),
          },
          null,
          2
        )
      );
      console.log("Generated RSA keys");
    }
  } catch (err) {
    console.error("Failed to initialize database:", err);
  }
}

// Read database
async function readDatabase() {
  try {
    const data = await fs.readFile(DB_FILE, "utf8");
    return JSON.parse(data);
  } catch (err) {
    return { users: {} };
  }
}

// Write database
async function writeDatabase(data) {
  await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2));
}

// Read RSA keys
async function readKeys() {
  try {
    const data = await fs.readFile(KEYS_FILE, "utf8");
    return JSON.parse(data);
  } catch (err) {
    throw new Error("RSA keys not found");
  }
}

// Crypto utilities
function pbkdf2(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(
      password,
      Buffer.from(salt),
      100000,
      32,
      "sha256",
      (err, key) => {
        if (err) reject(err);
        else resolve(key);
      }
    );
  });
}

function aesEncrypt(data, key) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);

  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);

  const tag = cipher.getAuthTag();

  return {
    ciphertext: Array.from(ciphertext),
    nonce: Array.from(nonce),
    tag: Array.from(tag),
  };
}

function aesDecrypt(ciphertext, key, nonce, tag) {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(nonce)
  );
  decipher.setAuthTag(Buffer.from(tag));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext)),
    decipher.final(),
  ]);
}

function rsaEncrypt(data, publicKey) {
  return crypto.publicEncrypt(
    {
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    data
  );
}

function rsaDecrypt(data, privateKey) {
  return crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(data)
  );
}

function cosineSimilarity(a, b) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// API Routes

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Get user count
app.get("/api/users/count", async (req, res) => {
  try {
    const db = await readDatabase();
    res.json({ count: Object.keys(db.users).length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Enrollment
app.post("/api/enroll", async (req, res) => {
  try {
    const { username, password, faceEmbedding } = req.body;

    if (!username || !password || !faceEmbedding) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const db = await readDatabase();

    if (db.users[username]) {
      return res.status(409).json({ error: "User already exists" });
    }

    const keys = await readKeys();

    // Generate AES key
    const aesKey = crypto.randomBytes(32);

    // Convert embedding array to buffer
    const embeddingBuffer = Buffer.from(new Float32Array(faceEmbedding).buffer);

    // Encrypt face embedding with AES
    const encrypted = aesEncrypt(embeddingBuffer, aesKey);

    // Encrypt AES key with RSA
    const encAesKey = rsaEncrypt(aesKey, keys.publicKey);

    // Hash password
    const pwdSalt = crypto.randomBytes(16);
    const pwdHash = await pbkdf2(password, pwdSalt);

    // Store user data
    db.users[username] = {
      username,
      pwdSalt: Array.from(pwdSalt),
      pwdHash: Array.from(pwdHash),
      encAesKey: Array.from(encAesKey),
      faceBlob: encrypted.ciphertext,
      faceNonce: encrypted.nonce,
      faceTag: encrypted.tag,
      embeddingMeta: {
        length: faceEmbedding.length,
        dtype: "float32",
      },
      createdAt: new Date().toISOString(),
    };

    await writeDatabase(db);

    res.json({
      success: true,
      message: "User enrolled successfully",
      userCount: Object.keys(db.users).length,
    });
  } catch (err) {
    console.error("Enrollment error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Login
app.post("/api/login", async (req, res) => {
  try {
    const { username, password, faceEmbedding } = req.body;

    if (!username || !password || !faceEmbedding) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const db = await readDatabase();
    const user = db.users[username];

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Verify password
    const pwdHash = await pbkdf2(password, Buffer.from(user.pwdSalt));
    const storedHash = Buffer.from(user.pwdHash);

    if (!pwdHash.equals(storedHash)) {
      return res.status(401).json({ error: "Invalid password" });
    }

    const keys = await readKeys();

    // Decrypt AES key
    const aesKey = rsaDecrypt(user.encAesKey, keys.privateKey);

    // Decrypt face embedding
    const decryptedBytes = aesDecrypt(
      user.faceBlob,
      aesKey,
      user.faceNonce,
      user.faceTag
    );

    // Convert back to Float32Array
    const storedEmbedding = Array.from(
      new Float32Array(
        decryptedBytes.buffer,
        decryptedBytes.byteOffset,
        decryptedBytes.byteLength / 4
      )
    );

    // Compare face embeddings
    const similarity = cosineSimilarity(faceEmbedding, storedEmbedding);
    const threshold = 0.6;

    if (similarity < threshold) {
      return res.status(401).json({
        error: "Face not recognized",
        similarity: similarity.toFixed(3),
      });
    }

    res.json({
      success: true,
      similarity: similarity,
      message: "Login successful",
      user: {
        username: user.username,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: err.message });
  }
});

// List all users (for debugging)
app.get("/api/users", async (req, res) => {
  try {
    const db = await readDatabase();
    const users = Object.keys(db.users).map((username) => ({
      username,
      createdAt: db.users[username].createdAt,
    }));
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete user (optional)
app.delete("/api/users/:username", async (req, res) => {
  try {
    const { username } = req.params;
    const db = await readDatabase();

    if (!db.users[username]) {
      return res.status(404).json({ error: "User not found" });
    }

    delete db.users[username];
    await writeDatabase(db);

    res.json({
      success: true,
      message: "User deleted",
      userCount: Object.keys(db.users).length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`✓ Server running on http://localhost:${PORT}`);
    console.log(`✓ Database directory: ${path.join(__dirname, "database")}`);
    console.log(`✓ Users file: ${DB_FILE}`);
    console.log(`✓ Keys file: ${KEYS_FILE}`);
  });
});
