=== server/routes.ts ===
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertReferralSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check endpoint for Railway
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  
  // Create user
  app.post("/api/users", async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      const existingUser = await storage.getUserByUsername(userData.username);
      
      if (existingUser) {
        return res.json(existingUser);
      }
      
      const user = await storage.createUser(userData);
      res.json(user);
    } catch (error) {
      res.status(400).json({ message: "Invalid user data" });
    }
  });

  // Get user by ID
  app.get("/api/users/:id", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Update energy before returning user
      const updatedUser = await storage.updateEnergy(userId);
      res.json(updatedUser);
    } catch (error) {
      res.status(400).json({ message: "Invalid user ID" });
    }
  });

  // Tap coin
  app.post("/api/users/:id/tap", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await storage.tapCoin(userId);
      
      if (!user) {
        return res.status(400).json({ message: "Cannot tap - no energy or user not found" });
      }

      // Check task progress for tapping
      const tasks = await storage.getAllTasks();
      const tapTask = tasks.find(t => t.type === "tap");
      if (tapTask) {
        await storage.updateUserTask(userId, tapTask.id, user.coins);
        if (user.coins >= (tapTask.target || 0)) {
          const userTask = await storage.getUserTaskProgress(userId, tapTask.id);
          if (userTask && !userTask.completed) {
            await storage.completeUserTask(userId, tapTask.id);
            const updatedUser = await storage.updateUser(userId, {
              coins: user.coins + tapTask.reward
            });
            return res.json(updatedUser);
          }
        }
      }
      
      res.json(user);
    } catch (error) {
      res.status(400).json({ message: "Invalid user ID" });
    }
  });

  // Get all tasks
  app.get("/api/tasks", async (req, res) => {
    try {
      const tasks = await storage.getAllTasks();
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tasks" });
    }
  });

  // Get user tasks progress
  app.get("/api/users/:id/tasks", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const userTasks = await storage.getUserTasks(userId);
      const allTasks = await storage.getAllTasks();
      
      const tasksWithProgress = allTasks.map(task => {
        const userTask = userTasks.find(ut => ut.taskId === task.id);
        return {
          ...task,
          progress: userTask?.progress || 0,
          completed: userTask?.completed || false,
        };
      });
      
      res.json(tasksWithProgress);
    } catch (error) {
      res.status(400).json({ message: "Invalid user ID" });
    }
  });

  // Complete task
  app.post("/api/users/:id/tasks/:taskId/complete", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const taskId = parseInt(req.params.taskId);
      
      const user = await storage.getUser(userId);
      const tasks = await storage.getAllTasks();
      const task = tasks.find(t => t.id === taskId);
      
      if (!user || !task) {
        return res.status(404).json({ message: "User or task not found" });
      }

      const userTask = await storage.getUserTaskProgress(userId, taskId);
      if (userTask?.completed) {
        return res.status(400).json({ message: "Task already completed" });
      }

      await storage.completeUserTask(userId, taskId);
      const updatedUser = await storage.updateUser(userId, {
        coins: user.coins + task.reward
      });
      
      res.json(updatedUser);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // Create referral
  app.post("/api/referrals", async (req, res) => {
    try {
      const referralData = insertReferralSchema.parse(req.body);
      
      // Check if referral already exists
      const existingReferrals = await storage.getUserReferrals(referralData.referrerId);
      const alreadyReferred = existingReferrals.some(r => r.referredId === referralData.referredId);
      
      if (alreadyReferred) {
        return res.status(400).json({ message: "User already referred" });
      }
      
      const referral = await storage.createReferral(referralData);
      
      // Update referrer's stats
      const referrer = await storage.getUser(referralData.referrerId);
      if (referrer) {
        await storage.updateUser(referralData.referrerId, {
          referralCount: referrer.referralCount + 1,
          referralEarnings: referrer.referralEarnings + referral.reward,
          coins: referrer.coins + referral.reward,
        });
      }
      
      // Update referred user
      const referred = await storage.getUser(referralData.referredId);
      if (referred) {
        await storage.updateUser(referralData.referredId, {
          referredBy: referralData.referrerId,
          coins: referred.coins + 500, // Bonus for being referred
        });
      }
      
      res.json(referral);
    } catch (error) {
      res.status(400).json({ message: "Invalid referral data" });
    }
  });

  // Get user referrals
  app.get("/api/users/:id/referrals", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const referrals = await storage.getUserReferrals(userId);
      
      // Get referred user details
      const referralsWithUsers = await Promise.all(
        referrals.map(async (referral) => {
          const referredUser = await storage.getUser(referral.referredId);
          return {
            ...referral,
            referredUser: referredUser ? {
              id: referredUser.id,
              username: referredUser.username,
              coins: referredUser.coins,
              level: referredUser.level,
            } : null,
          };
        })
      );
      
      res.json(referralsWithUsers);
    } catch (error) {
      res.status(400).json({ message: "Invalid user ID" });
    }
  });

  // Get leaderboard
  app.get("/api/leaderboard", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const leaderboard = await storage.getLeaderboard(limit);
      
      const leaderboardWithRanks = leaderboard.map((user, index) => ({
        ...user,
        rank: index + 1,
      }));
      
      res.json(leaderboardWithRanks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch leaderboard" });
    }
  });

  // Get user rank
  app.get("/api/users/:id/rank", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const leaderboard = await storage.getLeaderboard(1000); // Get more users to find rank
      
      const userRank = leaderboard.findIndex(user => user.id === userId) + 1;
      
      res.json({ rank: userRank || 999 });
    } catch (error) {
      res.status(400).json({ message: "Invalid user ID" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
