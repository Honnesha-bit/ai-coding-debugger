import crypto from 'node:crypto';
import { UserRepository } from '../db/repositories/userRepository.js';
import { config } from '../config.js';

export class AuthService {
  constructor(userRepo = null) {
    this.userRepo = userRepo || new UserRepository();
    this.sessionSecret = config.SESSION_SECRET;
  }

  hashPassword(password, salt = null) {
    const s = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, s, 64).toString('hex');
    return { hash, salt: s };
  }

  verifyPassword(password, hash, salt) {
    const candidateHash = crypto.scryptSync(password, salt, 64).toString('hex');
    const a = Buffer.from(hash, 'hex');
    const b = Buffer.from(candidateHash, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  signToken(payload) {
    const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', this.sessionSecret)
      .update(data)
      .digest('base64url');
    return `${data}.${signature}`;
  }

  verifyToken(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [data, signature] = parts;
    const expected = crypto
      .createHmac('sha256', this.sessionSecret)
      .update(data)
      .digest('base64url');
    
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    try {
      const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
      if (payload.exp && Date.now() > payload.exp) {
        return null; // Expired
      }
      return payload;
    } catch {
      return null;
    }
  }

  register({ username, email, password }) {
    if (!username || !email || !password) {
      throw new Error('Username, email, and password are required');
    }
    if (typeof username !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
      throw new Error('Username, email, and password must be strings');
    }
    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim();
    if (!trimmedUsername || !trimmedEmail) {
      throw new Error('Username, email, and password are required');
    }
    if (trimmedUsername.length < 3) {
      throw new Error('Username must be at least 3 characters');
    }
    if (trimmedUsername.length > 32) {
      throw new Error('Username cannot exceed 32 characters');
    }
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }
    if (password.length > 128) {
      throw new Error('Password cannot exceed 128 characters');
    }
    if (trimmedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      throw new Error('Invalid email format');
    }

    if (this.userRepo.findByUsername(trimmedUsername)) {
      throw new Error('Username already taken');
    }
    if (this.userRepo.findByEmail(trimmedEmail)) {
      throw new Error('Email already registered');
    }

    const { hash, salt } = this.hashPassword(password);
    const id = 'usr_' + crypto.randomBytes(8).toString('hex');
    const user = this.userRepo.createUser({
      id,
      username: trimmedUsername,
      email: trimmedEmail,
      passwordHash: hash,
      salt
    });

    const token = this.createSessionToken(user);
    return { user, token };
  }

  login({ username, password }) {
    if (!username || !password) {
      throw new Error('Username and password are required');
    }
    if (typeof username !== 'string' || typeof password !== 'string') {
      throw new Error('Username and password are required');
    }
    if (username.length > 32 || password.length > 128) {
      throw new Error('Invalid username or password');
    }

    const user = this.userRepo.findByUsername(username.trim());
    if (!user) {
      throw new Error('Invalid username or password');
    }

    const isValid = this.verifyPassword(password, user.password_hash, user.salt);
    if (!isValid) {
      throw new Error('Invalid username or password');
    }

    const safeUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      created_at: user.created_at
    };

    const token = this.createSessionToken(safeUser);
    return { user: safeUser, token };
  }

  createSessionToken(user) {
    // Session token expires in 7 days
    const payload = {
      userId: user.id,
      username: user.username,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
      nonce: crypto.randomBytes(8).toString('hex') // Rotates session ID
    };
    return this.signToken(payload);
  }

  getUserFromToken(token) {
    const payload = this.verifyToken(token);
    if (!payload || !payload.userId) return null;
    return this.userRepo.findById(payload.userId);
  }
}
