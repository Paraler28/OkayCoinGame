=== server/telegram-bot.ts ===
import TelegramBot from 'node-telegram-bot-api';
import { storage } from './storage';
import type { User } from '@shared/schema';

const token = process.env.TELEGRAM_BOT_TOKEN!;
const bot = new TelegramBot(token, { polling: true });

// Store Telegram user mappings
const telegramUserMap = new Map<number, number>(); // telegramId -> userId

export function initTelegramBot() {
  console.log('🤖 Telegram bot starting...');
  
  // Handle polling errors
  bot.on('polling_error', (error) => {
    console.log('Telegram polling error:', error);
  });

  // Command: /start
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramUser = msg.from;
    
    if (!telegramUser) return;

    try {
      // Check if user already exists
      let user = await getUserByTelegramId(telegramUser.id);
      
      if (!user) {
        // Create new user
        const username = telegramUser.username || `user${telegramUser.id}`;
        user = await storage.createUser({ username });
        telegramUserMap.set(telegramUser.id, user.id);
      }

      await bot.sendMessage(chatId, `🎮 Добро пожаловать в OK Coin!

💰 Текущий баланс: ${user.coins} монет
⚡ Энергия: ${user.energy}/${user.maxEnergy}
🏆 Уровень: ${user.level}

Команды:
💎 /tap - получить монеты (стоит 1 энергию)
💰 /balance - проверить баланс
👥 /referral - пригласить друзей
🏆 /leaderboard - таблица лидеров`, {
        reply_markup: {
          inline_keyboard: [[
            {
              text: '🎮 Играть OK Coin',
              callback_data: 'play_game'
            }
          ]]
        }
      });
    } catch (error) {
      console.error('Error in /start command:', error);
      await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.');
    }
  });

  // Command: /tap
  bot.onText(/\/tap/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramUser = msg.from;
    
    if (!telegramUser) return;

    try {
      const user = await getUserByTelegramId(telegramUser.id);
      
      if (!user) {
        await bot.sendMessage(chatId, 'Сначала нажмите /start чтобы начать игру!');
        return;
      }

      // Update energy first
      await storage.updateEnergy(user.id);
      const updatedUser = await storage.getUser(user.id);

      if (!updatedUser || updatedUser.energy <= 0) {
        await bot.sendMessage(chatId, `⚡ Недостаточно энергии!

Текущая энергия: ${updatedUser?.energy || 0}/${updatedUser?.maxEnergy || 1000}
💡 Энергия восстанавливается по 1 в секунду`);
        return;
      }

      // Tap coin
      const tappedUser = await storage.tapCoin(user.id);
      
      if (tappedUser) {
        await bot.sendMessage(chatId, `💰 +${tappedUser.coinsPerTap} монет!

💎 Баланс: ${tappedUser.coins} монет
⚡ Энергия: ${tappedUser.energy}/${tappedUser.maxEnergy}
📊 Всего тапов: ${tappedUser.totalTaps}`);
      } else {
        await bot.sendMessage(chatId, 'Ошибка при получении монет. Попробуйте позже.');
      }
    } catch (error) {
      console.error('Error in /tap command:', error);
      await bot.sendMessage(chatId, 'Ошибка при получении монет.');
    }
  });

  // Command: /balance
  bot.onText(/\/balance/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramUser = msg.from;
    
    if (!telegramUser) return;

    try {
      const user = await getUserByTelegramId(telegramUser.id);
      
      if (!user) {
        await bot.sendMessage(chatId, 'Сначала нажмите /start чтобы начать игру!');
        return;
      }

      // Update energy before showing balance
      await storage.updateEnergy(user.id);
      const updatedUser = await storage.getUser(user.id);

      await bot.sendMessage(chatId, `💰 Ваш баланс: ${updatedUser?.coins || 0} монет
⚡ Энергия: ${updatedUser?.energy || 0}/${updatedUser?.maxEnergy || 1000}
📊 Всего тапов: ${updatedUser?.totalTaps || 0}
👥 Рефералов: ${updatedUser?.referralCount || 0}`);
    } catch (error) {
      console.error('Error in /balance command:', error);
      await bot.sendMessage(chatId, 'Ошибка получения баланса.');
    }
  });

  // Command: /referral
  bot.onText(/\/referral/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramUser = msg.from;
    
    if (!telegramUser) return;

    try {
      const user = await getUserByTelegramId(telegramUser.id);
      
      if (!user) {
        await bot.sendMessage(chatId, 'Сначала нажмите /start чтобы начать игру!');
        return;
      }

      const referralLink = `https://t.me/CryptoOkayBot?start=ref${user.id}`;

      await bot.sendMessage(chatId, `👥 Пригласите друзей и получите бонусы!

🔗 Ваша реферальная ссылка:
${referralLink}

💰 За каждого друга: +1000 монет
🎁 Друг получает: +500 монет
👥 Приглашено: ${user.referralCount} друзей
💎 Заработано: ${user.referralEarnings} монет`, {
        reply_markup: {
          inline_keyboard: [[
            {
              text: '📤 Поделиться ссылкой',
              switch_inline_query: `Присоединяйся к OK Coin! 🎮 Зарабатывай монеты нажимая OK! ${referralLink}`
            }
          ]]
        }
      });
    } catch (error) {
      console.error('Error in /referral command:', error);
      await bot.sendMessage(chatId, 'Ошибка получения реферальной ссылки.');
    }
  });

  // Command: /leaderboard
  bot.onText(/\/leaderboard/, async (msg) => {
    const chatId = msg.chat.id;

    try {
      const leaderboard = await storage.getLeaderboard(10);
      
      let message = '🏆 Таблица лидеров:\n\n';
      
      if (leaderboard.length === 0) {
        message += 'Пока никого нет. Будьте первым!';
      } else {
        leaderboard.forEach((user, index) => {
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
          message += `${medal} ${user.username} - ${user.coins.toLocaleString()} монет\n`;
        });
      }

      await bot.sendMessage(chatId, message);
    } catch (error) {
      console.error('Error in /leaderboard command:', error);
      await bot.sendMessage(chatId, 'Ошибка получения таблицы лидеров.');
    }
  });

  // Handle callback queries (button presses)
  bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    const telegramUser = callbackQuery.from;
    
    if (!msg || !telegramUser) return;
    
    const chatId = msg.chat.id;
    
    try {
      if (data === 'play_game') {
        const user = await getUserByTelegramId(telegramUser.id);
        if (!user) {
          await bot.sendMessage(chatId, 'Сначала нажмите /start чтобы начать игру!');
          return;
        }
        
        // Update energy
        await storage.updateEnergy(user.id);
        const updatedUser = await storage.getUser(user.id);
        
        await bot.sendMessage(chatId, `🎮 OK Coin - Игровая панель

💰 Баланс: ${updatedUser?.coins || 0} монет
⚡ Энергия: ${updatedUser?.energy || 0}/${updatedUser?.maxEnergy || 1000}
🏆 Уровень: ${updatedUser?.level || 1}
📊 Всего тапов: ${updatedUser?.totalTaps || 0}

Нажмите кнопку OK чтобы заработать монеты!`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ OK (+1 монета)', callback_data: 'tap_coin' }],
              [
                { text: '💰 Баланс', callback_data: 'show_balance' },
                { text: '👥 Рефералы', callback_data: 'show_referrals' }
              ],
              [
                { text: '📋 Задания', callback_data: 'show_tasks' },
                { text: '🏆 Лидеры', callback_data: 'show_leaderboard' }
              ],
              [{ text: '🔄 Обновить', callback_data: 'play_game' }]
            ]
          }
        });
      }
      
      else if (data === 'tap_coin') {
        const user = await getUserByTelegramId(telegramUser.id);
        if (!user) return;
        
        // Update energy first
        await storage.updateEnergy(user.id);
        const currentUser = await storage.getUser(user.id);
        
        if (!currentUser || currentUser.energy <= 0) {
          await bot.answerCallbackQuery(callbackQuery.id, {
            text: `⚡ Недостаточно энергии! (${currentUser?.energy || 0}/${currentUser?.maxEnergy || 1000})`,
            show_alert: true
          });
          return;
        }
        
        // Tap coin
        const tappedUser = await storage.tapCoin(user.id);
        
        if (tappedUser) {
          await bot.answerCallbackQuery(callbackQuery.id, {
            text: `💰 +${tappedUser.coinsPerTap} монет!`,
            show_alert: false
          });
          
          // Update the message
          await bot.editMessageText(`🎮 OK Coin - Игровая панель

💰 Баланс: ${tappedUser.coins} монет
⚡ Энергия: ${tappedUser.energy}/${tappedUser.maxEnergy}
🏆 Уровень: ${tappedUser.level}
📊 Всего тапов: ${tappedUser.totalTaps}

Нажмите кнопку OK чтобы заработать монеты!`, {
            chat_id: chatId,
            message_id: msg.message_id,
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅ OK (+1 монета)', callback_data: 'tap_coin' }],
                [
                  { text: '💰 Баланс', callback_data: 'show_balance' },
                  { text: '👥 Рефералы', callback_data: 'show_referrals' }
                ],
                [
                  { text: '📋 Задания', callback_data: 'show_tasks' },
                  { text: '🏆 Лидеры', callback_data: 'show_leaderboard' }
                ],
                [{ text: '🔄 Обновить', callback_data: 'play_game' }]
              ]
            }
          });
        }
      }
      
      else if (data === 'show_balance') {
        const user = await getUserByTelegramId(telegramUser.id);
        if (!user) return;
        
        await storage.updateEnergy(user.id);
        const updatedUser = await storage.getUser(user.id);
        
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: `💰 ${updatedUser?.coins || 0} монет | ⚡ ${updatedUser?.energy || 0}/${updatedUser?.maxEnergy || 1000} энергии`,
          show_alert: true
        });
      }
    } catch (error) {
      console.error('Callback query error:', error);
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: 'Произошла ошибка',
        show_alert: true
      });
    }
  });

  console.log('✅ Telegram bot initialized successfully!');
}

async function getUserByTelegramId(telegramId: number): Promise<User | undefined> {
  const userId = telegramUserMap.get(telegramId);
  if (userId) {
    return await storage.getUser(userId);
  }
  return undefined;
}
