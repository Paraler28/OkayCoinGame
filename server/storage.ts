=== server/storage.ts ===
import { users, tasks, userTasks, referrals, type User, type InsertUser, type Task, type InsertTask, type UserTask, type InsertUserTask, type Referral, type InsertReferral } from "@shared/schema";

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<User>): Promise<User | undefined>;
  
  // Task operations
  getAllTasks(): Promise<Task[]>;
  createTask(task: InsertTask): Promise<Task>;
  
  // User task operations
  getUserTasks(userId: number): Promise<UserTask[]>;
  getUserTaskProgress(userId: number, taskId: number): Promise<UserTask | undefined>;
  updateUserTask(userId: number, taskId: number, progress: number): Promise<UserTask | undefined>;
  completeUserTask(userId: number, taskId: number): Promise<UserTask | undefined>;
  
  // Referral operations
  createReferral(referral: InsertReferral): Promise<Referral>;
  getUserReferrals(userId: number): Promise<Referral[]>;
  
  // Leaderboard
  getLeaderboard(limit?: number): Promise<User[]>;
  
  // Game actions
  tapCoin(userId: number): Promise<User | undefined>;
  updateEnergy(userId: number): Promise<User | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private tasks: Map<number, Task>;
  private userTasks: Map<string, UserTask>; // key: `${userId}-${taskId}`
  private referrals: Map<number, Referral>;
  private currentUserId: number;
  private currentTaskId: number;
  private currentUserTaskId: number;
  private currentReferralId: number;

  constructor() {
    this.users = new Map();
    this.tasks = new Map();
    this.userTasks = new Map();
    this.referrals = new Map();
    this.currentUserId = 1;
    this.currentTaskId = 1;
    this.currentUserTaskId = 1;
    this.currentReferralId = 1;
    
    this.initializeTasks();
  }

  private initializeTasks() {
    const defaultTasks: InsertTask[] = [
      {
        title: "Share with 5 friends",
        description: "Invite friends to earn bonus coins",
        reward: 500,
        icon: "fas fa-share",
        type: "share",
        target: 5,
        isActive: true,
      },
      {
        title: "Reach 1000 coins",
        description: "Tap your way to 1000 coins",
        reward: 200,
        icon: "fas fa-check",
        type: "tap",
        target: 1000,
        isActive: true,
      },
      {
        title: "Join Telegram Channel",
        description: "Stay updated with latest news",
        reward: 300,
        icon: "fab fa-telegram",
        type: "join",
        isActive: true,
      },
    ];

    defaultTasks.forEach(task => {
      this.createTask(task);
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = {
      ...insertUser,
      id,
      coins: 0,
      energy: 1000,
      maxEnergy: 1000,
      level: 1,
      totalTaps: 0,
      coinsPerTap: 1,
      referralCount: 0,
      referralEarnings: 0,
      referredBy: null,
      lastEnergyUpdate: new Date(),
      createdAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;

    const updatedUser = { ...user, ...updates };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async getAllTasks(): Promise<Task[]> {
    return Array.from(this.tasks.values()).filter(task => task.isActive);
  }

  async createTask(task: InsertTask): Promise<Task> {
    const id = this.currentTaskId++;
    const newTask: Task = {
      ...task,
      id,
      createdAt: new Date(),
    };
    this.tasks.set(id, newTask);
    return newTask;
  }

  async getUserTasks(userId: number): Promise<UserTask[]> {
    return Array.from(this.userTasks.values()).filter(ut => ut.userId === userId);
  }

  async getUserTaskProgress(userId: number, taskId: number): Promise<UserTask | undefined> {
    return this.userTasks.get(`${userId}-${taskId}`);
  }

  async updateUserTask(userId: number, taskId: number, progress: number): Promise<UserTask | undefined> {
    const key = `${userId}-${taskId}`;
    let userTask = this.userTasks.get(key);
    
    if (!userTask) {
      userTask = {
        id: this.currentUserTaskId++,
        userId,
        taskId,
        progress: 0,
        completed: false,
        completedAt: null,
        createdAt: new Date(),
      };
    }

    userTask.progress = progress;
    this.userTasks.set(key, userTask);
    return userTask;
  }

  async completeUserTask(userId: number, taskId: number): Promise<UserTask | undefined> {
    const key = `${userId}-${taskId}`;
    const userTask = this.userTasks.get(key);
    if (!userTask) return undefined;

    userTask.completed = true;
    userTask.completedAt = new Date();
    this.userTasks.set(key, userTask);
    return userTask;
  }

  async createReferral(referral: InsertReferral): Promise<Referral> {
    const id = this.currentReferralId++;
    const newReferral: Referral = {
      ...referral,
      id,
      createdAt: new Date(),
    };
    this.referrals.set(id, newReferral);
    return newReferral;
  }

  async getUserReferrals(userId: number): Promise<Referral[]> {
    return Array.from(this.referrals.values()).filter(r => r.referrerId === userId);
  }

  async getLeaderboard(limit: number = 10): Promise<User[]> {
    return Array.from(this.users.values())
      .sort((a, b) => b.coins - a.coins)
      .slice(0, limit);
  }

  async tapCoin(userId: number): Promise<User | undefined> {
    const user = this.users.get(userId);
    if (!user || user.energy <= 0) return undefined;

    const updatedUser = {
      ...user,
      coins: user.coins + user.coinsPerTap,
      energy: Math.max(0, user.energy - 1),
      totalTaps: user.totalTaps + 1,
    };

    this.users.set(userId, updatedUser);
    return updatedUser;
  }

  async updateEnergy(userId: number): Promise<User | undefined> {
    const user = this.users.get(userId);
    if (!user) return undefined;

    const now = new Date();
    const timeDiff = Math.floor((now.getTime() - user.lastEnergyUpdate.getTime()) / 1000);
    const energyToAdd = Math.min(timeDiff, user.maxEnergy - user.energy);

    if (energyToAdd > 0) {
      const updatedUser = {
        ...user,
        energy: Math.min(user.maxEnergy, user.energy + energyToAdd),
        lastEnergyUpdate: now,
      };
      this.users.set(userId, updatedUser);
      return updatedUser;
    }

    return user;
  }
}

export const storage = new MemStorage();
