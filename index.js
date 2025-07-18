import { Client, GatewayIntentBits, PresenceUpdateStatus, ActivityType, MessageFlags, PermissionsBitField, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import { exec } from 'child_process';
import ModelClient from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from "url";
import * as deepl from 'deepl-node';
import express, { response } from 'express';
import { Ollama } from 'ollama';
import {getSnapAppRender} from 'twitter-snap'
import { createRequire } from 'module';
const require = createRequire(import.meta.url); // CommonJSのrequireを使用するためにつくったやつ package.jsonでESMにしたせいでこうなってる
const crypt = require('unix-crypt-td-js');
import puppeteer from 'puppeteer';
import cors from 'cors';

const app = express();
app.use(cors());
const port = 3000

dotenv.config();
const maintainaceMode = false

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildPresences
  ]
});

const activePolls = new Map();

// API
app.get('/', (req, res) => {
  res.send('Sorry, this is not the API, the API is /status.')
})

app.get('/status', (req, res) => {
  res.json({
      bot: client.user ? client.user.tag : "Bot未接続",
      botId: client.user.id,
      uptime: process.uptime(),
      ping: client.ws.ping,
      instserv: client.guilds.cache.size,
      totalmem: client.guilds.cache.reduce((sum, guild) => sum + guild.memberCount, 0)

  });
});

app.listen(port, () => {
  console.log(`API Server listening on http://localhost:${port}/status`)
})

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const githubToken = process.env["GITHUB_TOKEN"];
const endpoint = "https://models.github.ai/inference";

const DeepLAuthKey = process.env["DEEPL_TOKEN"]
const translator = new deepl.Translator(DeepLAuthKey);
 
// デフォルトステータスメッセージ
let StatusMessages = process.env["DEFAULT_STATUS_MESSAGE"];

const OllamaAIList = ["TinySwallow-1.5B-Instruct","sarashina2.2-3b-instruct-v0.1"]

async function generateWithGitHubModelsAndOllama(channelId, modelName, text) {
  
  // OllamaでAIに回答させるほう
  if (OllamaAIList.includes(modelName)) {
    if (modelName === "TinySwallow-1.5B-Instruct") {
    const ollama = new Ollama();

    let conversation = loadConversations(channelId);
    const response = await ollama.chat({
      model: 'hf.co/SakanaAI/TinySwallow-1.5B-Instruct-GGUF:Q8_0', 
      messages: conversation
  });

  return response.message;

} 

if (modelName === "sarashina2.2-3b-instruct-v0.1") {
  const ollama = new Ollama();

  let conversation = loadConversations(channelId);
  const response = await ollama.chat({
    model: 'hf.co/mmnga/sarashina2.2-3b-instruct-v0.1-gguf', 
    messages: conversation
});
  return response.message;
}}

// GitHub ModelsでAIに回答させるほう
if (!OllamaAIList.includes(modelName)) {

  const client = new ModelClient(endpoint, new AzureKeyCredential(githubToken));
  let conversation = loadConversations(channelId);


  const response = await client.path("/chat/completions").post({
    body: {
      messages: conversation,
      temperature: 1.0,
      top_p: 1.0,
      max_tokens: 1000,
      model: modelName
    }
  });

  if (response.status !== "200") {
      throw response.body.error;
  }
  // console.log(response.body.choices[0].message.content);
  return response.body.choices[0].message;
}}

client.once('ready', async () => {
  const rawData = fs.readFileSync(path.join(__dirname, 'command-register.json'), 'utf-8');
  const commands = JSON.parse(rawData);
  await client.application.commands.set(commands);
});

client.on("ready", () => {
  console.log(`Bot起動完了 (${client.user.tag})`);
  client.startTime = Date.now();

  setInterval(() => {
    client.user.setActivity({ 
        name: `${StatusMessages} | ${client.ws.ping}ms`,
        type: ActivityType.Custom
    });
  }, 3000);
});

client.on("guildCreate", async (guild) => {
  // 参加したサーバーの所有者にDMを送信
  const owner = await guild.fetchOwner();
  const dmChannel = await owner.createDM();
  const welcomeEmbed = {
    title: 'Bot導入ありがとうございます！',
    description: 'PiriBotを導入していただきありがとうございます！\n\nこのBotはAIを使用して会話することができる機能や、その他様々な便利なツールを提供します。\n\nコマンドの一覧については、`/help`をご確認ください。\n\n何か問題があれば、komepiri8955までご連絡ください。',
    color: 0x00ff00
  }
  dmChannel.send({ embeds: [welcomeEmbed] });
})

// メッセージ保存ディレクトリ
const userMessageDir = path.join(__dirname, 'UserMessage');
if (!fs.existsSync(userMessageDir)) {
    fs.mkdirSync(userMessageDir);
}

// 会話内容を保存する関数
function saveMessage(channelId, role, content, models) {
  const conversationsDir = path.join(__dirname, 'conversations');
  if (!fs.existsSync(conversationsDir)) {
      fs.mkdirSync(conversationsDir);
  }
  const channelFilePath = path.join(conversationsDir, `${channelId}.json`);
  let conversation = [];
  
  // システムメッセージを追加
  const systemMessage = { role: "system", content: `You are PiriBot (<@1275786474805002341>), an AI bot running on Discord. Your language model is ${models}. You will receive messages in the format “name:userid:content”, please respond to the content. If you want to mention it, please use the format <@userid>. userid is a number of about 19 digits.` };

  if (fs.existsSync(channelFilePath)) {
      conversation = JSON.parse(fs.readFileSync(channelFilePath));
  }

  // システムメッセージが存在しない場合のみ追加
  if (!conversation.some(msg => msg.role === "system")) {
      conversation.push(systemMessage);
  }

  conversation.push({ role, content });
  fs.writeFileSync(channelFilePath, JSON.stringify(conversation, null, 2));
}

// チャンネルごとの会話内容を読み込む関数
function loadConversations(channelId) {
  const channelFilePath = path.join(__dirname, 'conversations', `${channelId}.json`);
  let conversation = [];

  if (fs.existsSync(channelFilePath)) {
      conversation = JSON.parse(fs.readFileSync(channelFilePath));
  }

  return conversation;
}

// なんかいろいろ(なくてもいい)
const trackedUsersFilePath = path.join(__dirname, 'tracked_users.json');
function loadTrackedUsers() {
    if (fs.existsSync(trackedUsersFilePath)) {
        return JSON.parse(fs.readFileSync(trackedUsersFilePath));
    }
    return {};
}

const trackedUsers = loadTrackedUsers();


// 自動応答設定を保存するJSONファイルのパス
const channelsFilePath = path.join(__dirname, 'channels.json');

// 自動応答設定を読み込む関数
function loadChannelSettings() {
  if (fs.existsSync(channelsFilePath)) {
    const data = fs.readFileSync(channelsFilePath);
    return JSON.parse(data);
  }
  return { channels: {} };
}

// 自動応答設定を保存する関数
function saveChannelSettings(channels) {
  fs.writeFileSync(channelsFilePath, JSON.stringify(channels, null, 2));
}

// 暗号化されたファイルの保存先
const encryptedFilePath = path.join(__dirname, 'encrypted_temp.txt');

// 復号化後のファイルの保存先
const decryptedFilePath = path.join(__dirname, 'decrypted.txt');


// トリップ作成(WikipediaのPerlコードの移植)
function generateTrip(tripkey) {
    let salt = (tripkey + 'H.').slice(1, 3);
    salt = salt.replace(/[^\.-z]/g, '.');
    salt = salt.replace(/[:;<=>?@[\\\]^_`]/g, c =>
        'ABCDEFGabcdef'.charAt(':;<=>?@[\\]^_`'.indexOf(c))
    );

    const hash = crypt(tripkey, salt);
    const trip = hash.slice(-10);

    return '◆' + trip;
}

async function generateMiqImages(username, displayName, text, avatarUrl, color) {
    const requestData = {
        username: username,             
        display_name: displayName, 
        text: text,     
        avatar: avatarUrl, 
        color: color,               
    };
    
        try {
        const response = await fetch('https://api.voids.top/fakequote', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData),
        });

        if (!response.ok) {
            throw new Error(`HTTPエラー: ${response.status}`);
        }

        const data = await response.json();
        return data.url; 
    } catch (error) {
        console.error('miq画像生成失敗:', error);
    }
  }

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // メッセージを保存
    if (trackedUsers[message.author.id]) {
      const userFilePath = path.join(userMessageDir, `${message.author.id}.txt`);
      fs.appendFileSync(userFilePath, `${message.createdAt}: ${message.content}\n`);
  }

    // GitHub ModelsでAIに回答させるやつ
    const channels = loadChannelSettings();
    if (!channels.channels[message.guild.id]) {
        return;
    }
    if (message.content.startsWith(';')) {
        return;
    }
    const targetChannelId = channels.channels[message.guild.id].channelId;
    const model = channels.channels[message.guild.id].model;
    // console.log(targetChannelId)
    const username = message.author.username;
    const userid = message.author.id;
    if (message.channel.id === targetChannelId) {
      try {
          saveMessage(message.channel.id, "user", `${username}:${userid}:${message.content}`, model);
          // 「入力中...」ステータスを表示
          await message.channel.sendTyping();

          const text = await generateWithGitHubModelsAndOllama(targetChannelId, model ,`${username}:${message.content}`);
          // console.log(text);

          // 生成が完了したらメッセージを送信
          await message.channel.send(`${text.content}\n\n model: ${model}`);

          // 会話内容を保存
          saveMessage(message.channel.id, "assistant", text.content, model);
      } catch (err) {
          console.log(err);
      }
  }
});

// スラッシュコマンドの処理
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isCommand()) return;
    if (maintainaceMode === true && interaction.user.id !== process.env["ADMIN_USRID"]) {
        interaction.reply('メンテナンス中のため、現在コマンドを使用できません。');    
        return;
    }

      if (interaction.commandName === 'help') {
    
    const categoriesAndCommandLists = {
        'AI系': [
            { name: 'ai_setchannel', description: 'AIが自動応答するチャンネルを設定します。' },
            { name: 'ai_delchannel', description: 'AIの自動応答設定を削除します。' },
            { name: 'ai_model_change', description: 'AIが使用する言語モデルを変更します。' },
            { name: 'ai_conv_reset', description: '現在のチャンネルの会話記録をリセットします。' },
            { name: 'ai_status', description: 'AIの自動応答状態を表示します。' },
            { name: 'ai_conv_exp', description: '現在のチャンネルの会話内容をJSON形式でエクスポートします。' }
        ],
        '管理者ツール': [
            { name: 'admincmd', description: 'Botの情報を表示(開発者専用)' },
            { name: 'ping', description: 'BotのPing値を表示します。' },
            { name: 'uptime', description: 'Botの起動時間を表示します。' },
        ],
        'ツール' : [
            { name: 'translator', description: 'テキストを翻訳します。' },
            { name: 'random-timeout', description: 'ランダムに選ばれたメンバーにタイムアウトを実行します。' },
            { name: 'dice', description: '指定した面数のサイコロを振ります。' },
            { name: 'poll', description: '匿名投票を作成します。' },
            { name: 'end-poll', description: '匿名投票を終了し、結果を表示します。' },
            { name: 'encry', description: 'テキストを暗号化してファイルとして保存します。' },
            { name: 'dcry', description: '暗号化されたファイルを復号化して内容を表示します。' },
            { name: 'screenshot', description: '指定したURLのスクリーンショットを取得します。' },
            { name: 'snap-tweet', description: '指定したツイートのスクリーンショットを生成します。' },
            { name: 'generate-trip', description: '電子掲示板などで使用されるトリップを生成します。' },
            { name: 'role-panel', description: 'パネルを作成します。' },
        ],
        'その他': [
            { name: 'word2vec-similar', description: '指定した単語の類似単語を取得します。使えない場合が多いです。' },
            { name: 'word2vec-calc', description: 'Word2Vecでの単語の計算を行います。使えない場合が多いです。' },
            { name: 'Make it a Quoteの作成', description: 'Make it a Quoteの画像を生成します。コンテキストメニューのコマンドです。' }
        ]
    };
    
    const initialEmbed = {
        title: 'Help',
        description: '左下のドロップダウンメニューから表示したいカテゴリを選択してください。',
        color: 0x00ff00
    };
    
    const selectOptions = Object.keys(categoriesAndCommandLists).map(category => ({
        label: category,
        value: category,
        description: `${category} のコマンド一覧を表示`
    }));
    
    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('help_select')
            .setPlaceholder('カテゴリを選択')
            .addOptions(selectOptions)
    );
    
    await interaction.reply({ embeds: [initialEmbed], components: [row] });
    
    const filter = i => i.customId === 'help_select' && i.user.id === interaction.user.id;
    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });
    
    collector.on('collect', async i => {
        const category = i.values[0];
        const commands = categoriesAndCommandLists[category];
        const commandDescriptions = commands.map(cmd => `**${cmd.name}**: ${cmd.description}`).join('\n');
    
        const updatedEmbed = {
            title: `Help ${category}`,
            description: commandDescriptions,
            color: 0x00ff00
        };
    
        // 選択メニューはそのまま表示
        await i.update({ embeds: [updatedEmbed], components: [row] });
    });
}

    if (interaction.commandName === 'ai_setchannel') {
        const targetChannel = interaction.options.getChannel('channel');
        const model = interaction.options.getString('model');
        const channels = loadChannelSettings();
        channels.channels[interaction.guild.id] = {
            channelId: targetChannel.id,
            model: model
        };
        saveChannelSettings(channels);
        await interaction.reply(`AIが自動応答するチャンネルを ${targetChannel} に設定しました。\nAIに応答してほしくない場合には「;」をメッセージの先頭につけてください。\n言語モデル: ${model}`);
        console.log(`${new Date().toLocaleString()}:[AI Set Channel] channel set ${interaction.guild.id} / ${targetChannel.id} successfully.`);
    }

    if (interaction.commandName === 'ai_delchannel') {
      const channels = loadChannelSettings();
      if (channels.channels[interaction.guild.id]) {
          const targetChannel = channels.channels[interaction.guild.id].channelId;
          delete channels.channels[interaction.guild.id];
          saveChannelSettings(channels);
          await interaction.reply(`<#${targetChannel}>の自動応答設定を削除しました。\n今までの会話記録をリセットする場合は、ai_conv_resetコマンドを使用してください。`);
          console.log(`${new Date().toLocaleString()}:[AI Del Channel] delete channel ${interaction.guild.id} / ${targetChannel} successfully.`);
      } else {
          await interaction.reply('このチャンネルには自動応答が有効化されていません。');
          console.log(`channel ${interaction.guild.id} not found.`);
      }
  }

    if (interaction.commandName === 'ai_model_change') {
        const model = interaction.options.getString('model');
        const channels = loadChannelSettings();
        if (channels.channels[interaction.guild.id]) {
            channels.channels[interaction.guild.id].model = model;
            saveChannelSettings(channels);
            await interaction.reply(`AIの使用する言語モデルを ${model} に変更しました。`);
            console.log(`${new Date().toLocaleString()}:[AI Model Change] ${interaction.guild.id} / ${model} successfully.`);
        } else {
            await interaction.reply('このチャンネルには自動応答が有効化されていません。');
            console.log(`${new Date().toLocaleString()}:[AI Model Change] channel ${interaction.guild.id} not found.`);
        }
    }

    if (interaction.commandName === 'ai_conv_reset') {
        const channels = loadChannelSettings();
            const channelFilePath = path.join(__dirname, 'conversations', `${interaction.channel.id}.json`);
            if (fs.existsSync(channelFilePath)) {
                fs.unlinkSync(channelFilePath);
                await interaction.reply(`<#${interaction.channel.id}>の会話記録をリセットしました。`);
                console.log(`${new Date().toLocaleString()}:[AI conv Reset] reset conversation ${interaction.guild.id} / ${interaction.channel.id} successfully.`);
            } else {
                await interaction.reply('会話記録が見つかりません。');
                console.log(`${new Date().toLocaleString()}:[AI conv Reset] conversation ${interaction.guild.id} / ${interaction.channel.id} not found.`);
            }
        }

    if (interaction.commandName === 'ai_status') {
      const channels = loadChannelSettings();
      const targetChannel = channels.channels[interaction.guild.id];
      let model = '未設定';
      let currentChannelMessages = [];
      if (targetChannel) {
          model = targetChannel.model;
          currentChannelMessages = loadConversations(targetChannel.channelId);
      }
      let currentChannelMessagesLength = currentChannelMessages.length - 1;
      if (currentChannelMessagesLength < 0) {
          currentChannelMessagesLength = 0;
      }
      const embed = {
          title: '自動応答の状態',
          description: `自動応答チャンネル: ${targetChannel ? `<#${targetChannel.channelId}>` : '未設定'}`,
          color: 0x00ff00,
          fields: [
              {
                  name: '言語モデル',
                  value: model
              },
              {
                  name: '自動応答の状態',
                  value: targetChannel ? '有効' : '無効'
              },
              {
                  name: '現在までの総会話数(AIからの返答を含む)',
                  value: currentChannelMessagesLength
              }
          ],
          footer: {
            text: "GitHub Repo:https://github.com/komepiri/Piri-Discord-Bot"
          }
      }
      await interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'ai_conv_exp') {
      const channels = loadChannelSettings()
      if (channels.channels[interaction.guild.id]) {
        // 会話内容をjsonでそのままファイルとして(システムメッセージを除く)送信
        const targetChannel = channels.channels[interaction.guild.id].channelId;
        const channelMessages = loadConversations(targetChannel);
        const messages = channelMessages.filter(msg => msg.role !== 'system');
        // const messagesText = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
        const messagesFilePath = path.join(__dirname, 'messages.txt');
        fs.writeFileSync(messagesFilePath, JSON.stringify(messages, null, 2));
        await interaction.reply({
            files: [{
                attachment: messagesFilePath,
                name: 'messages.txt'
            }]
        });
        fs.unlinkSync(messagesFilePath);
    } else {
        await interaction.reply('このチャンネルには自動応答が有効化されていません。');
    }
  }
      
      if (interaction.commandName === 'setstatus') {
        // 管理者権限をチェック
        if (interaction.user.id !== process.env["ADMIN_USRID"]) {
          await interaction.reply('このコマンドを使用する権限がありません。');
          return;
      }

        const newStatusMessage = interaction.options.getString('message');
        StatusMessages = newStatusMessage;
        client.user.setActivity({ 
          name: `${StatusMessages} | ${client.ws.ping}ms`,
          type: ActivityType.Custom
      });
        await interaction.reply(`ステータスメッセージを変更しました。`);
    }

    if (interaction.commandName === 'setpresence') {
      // 管理者権限をチェック
      if (interaction.user.id !== process.env["ADMIN_USRID"]) {
        await interaction.reply('このコマンドを使用する権限がありません。');
        return;
    }

      const status = interaction.options.getString('status'); 

      try {
          switch (status) {
              case 'online':
                  await client.user.setStatus(PresenceUpdateStatus.Online);
                  break;
              case 'idle':
                  await client.user.setStatus(PresenceUpdateStatus.Idle);
                  break;
              case 'dnd':
                  await client.user.setStatus(PresenceUpdateStatus.DoNotDisturb);
                  break;
              case 'invisible':
                  await client.user.setStatus(PresenceUpdateStatus.Invisible);
                  break;
              default:
                  throw new Error('無効なステータスです。');
          }
          await interaction.reply(`ステータスを変更しました。`);
      } catch (err) {
          console.log(err);
          await interaction.reply('ステータスの更新中にエラーが発生しました。');
      }
  }

  if (interaction.commandName === 'ping') {
    const ping = client.ws.ping;
    await interaction.reply(`🏓Pong! \n現在のPing値:${ping}ms`);
  }

  if (interaction.commandName === 'uptime') {
    const uptime = Date.now() - client.startTime;
    const uptimeSeconds = Math.floor((uptime / 1000) % 60);
    const uptimeMinutes = Math.floor((uptime / (1000 * 60)) % 60);
    const uptimeHours = Math.floor((uptime / (1000 * 60 * 60)) % 24);
    const uptimeDays = Math.floor(uptime / (1000 * 60 * 60 * 24));
    await interaction.reply(`Botの起動時間: ${uptimeDays}日 ${uptimeHours}時間 ${uptimeMinutes}分 ${uptimeSeconds}秒`); 
  }

  if (interaction.commandName === 'sysinfo') {
    exec(`python3 ${__dirname}/monitor.py`, (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        return interaction.reply('システム情報の取得に失敗しました。');
      }
      if (stderr) {
        console.error(`stderr: ${stderr}`);
        return interaction.reply('システム情報の取得に失敗しました。');
      }
      try {
        const stats = JSON.parse(stdout);
        console.log(stdout)
        const memoryUsedGB = Math.floor(stats.memory_used_gb * 100) / 100;
        const memoryTotalGB = Math.floor(stats.memory_total_gb * 100) / 100;
        const cpuPercent = Math.floor(stats.cpu_percent * 100) / 100;

        const responseMessage = `システム情報:\nメモリ使用量: ${memoryUsedGB} GB / ${memoryTotalGB} GB\nCPU使用率: ${cpuPercent} %`;
        interaction.reply(responseMessage);
      } catch (parseError) {
        console.error(`parse error: ${parseError}`);
        interaction.reply('システム情報の解析に失敗しました。');
      }
    });
  }

  if (interaction.commandName === 'admincmd') {
    const action = interaction.options.getString('action');
    const targetGuildID = interaction.options.getString('target');
    // ユーザーIDで管理者をチェック
    if (interaction.user.id !== process.env["ADMIN_USRID"]) {
        await interaction.reply('このコマンドを使用する権限がありません。');
        return;
    }
    
    // Embedで参加しているサーバー数と、BotのID、名前、Ping値を送信
    const guildCount = client.guilds.cache.size;
    const botId = client.user.id;
    const botName = client.user.username;
    const ping = client.ws.ping;

    if (action === 'BotInfo') {
    const embed = {
        title: 'Bot Information List',
        description: `導入サーバー数: ${guildCount}\n\n`,
        color: 0x00ff00,
        fields: [
            {
                name: 'Bot ID',
                value: botId
            },
            {
                name: 'Bot Name',
                value: botName
            },
            {
                name: 'Ping',
                value: `${ping}ms`
            },
            {
                name: 'API URL',
                value: `http://127.0.0.1:3000/status`
            },
            {
                name: 'Bot Website',
                value: `https://komepiri.github.io/piribot/`
            },
            {
              name: 'index.js File Size',
              value: `${(fs.statSync(__filename).size / 1024).toFixed(2)} KB`
            }
        ]
      }
      await interaction.reply({ embeds: [embed] });
    }

if (action === 'BotGuildInfo') {
    const guildEntries = client.guilds.cache.map(guild => `• ${guild.name} \`(${guild.id})\``);
    
    // DiscordのEmbedフィールドのvalueは最大1024文字、全体で6000文字までなので制限する
    const chunkSize = 1000;
    let descriptionChunks = [''];
    let currentIndex = 0;

    for (const entry of guildEntries) {
        if ((descriptionChunks[currentIndex] + '\n' + entry).length > chunkSize) {
            currentIndex++;
            descriptionChunks[currentIndex] = '';
        }
        descriptionChunks[currentIndex] += (descriptionChunks[currentIndex] ? '\n' : '') + entry;
    }

    const embed = {
        title: '🧩 Bot Guild List',
        description: `🤖 導入サーバー数: **${guildCount}**\n`,
        color: 0x00bfff,
        fields: descriptionChunks.map((chunk, index) => ({
            name: `Guilds (${index + 1})`,
            value: chunk
        }))
    };

    await interaction.reply({ embeds: [embed] });
}


    if (action === 'Botleave') {
      if (!targetGuildID) {
          await interaction.reply('ターゲットのサーバーIDを指定してください。');
          return;
      }
      const targetGuild = client.guilds.cache.get(targetGuildID);
      if (!targetGuild) {
          await interaction.reply('指定されたサーバーが見つかりません。');
          return;
      }
      try {
          await targetGuild.leave();
          const logEmbed = {
              title: '✅Botサーバー退出成功',
              description: `Botはサーバー ${targetGuild.name} (${targetGuild.id}) から退出しました。`,
          }
          await interaction.reply({ embeds: [logEmbed] });
      } catch (error) {
          console.error(`Error leaving guild: ${error}`);
          const logEmbed = {
              title: '❌Botサーバー退出失敗',
              description: `Botはサーバー ${targetGuild.name} (${targetGuild.id}) から退出できませんでした。\nエラー: ${error.message}`,
          }
          await interaction.reply({ embeds: [logEmbed] });
      }
    }
  }

  if (interaction.commandName === 'encry') {
    const text = interaction.options.getString('text');
    const password = interaction.options.getString('password');

    const command = `echo -n "${text}" | openssl enc -aes-256-cbc -salt -pbkdf2 -base64 -out ${encryptedFilePath} -k ${password}`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error: ${error.message}`);
            return interaction.reply(`Error:${error.message}`);
        }
        if (stderr) {
            console.error(`stderr: ${stderr}`);
            return interaction.reply(`Error:${stderr}`);
        }

        interaction.reply({
            files: [{
                attachment: encryptedFilePath,
                name: 'encrypted.txt'
            }]
        }).then(() => {
            fs.unlinkSync(encryptedFilePath);
        }).catch(err => {
            console.error(`File send error: ${err}`);
        });
    });
  }

if (interaction.commandName === 'dcry') {
    const attachment = interaction.options.getAttachment('file');
    const attachmentURL = attachment.url;
    const password = interaction.options.getString('password');

    // ファイルをダウンロードして保存
    fetch(attachmentURL)
        .then(response => response.arrayBuffer())
        .then(buffer => {
            fs.writeFileSync(encryptedFilePath, Buffer.from(buffer));

            const command = `openssl enc -aes-256-cbc -d -pbkdf2 -base64 -in ${encryptedFilePath} -out ${decryptedFilePath} -k ${password}`;

            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error: ${error.message}`);
                    return interaction.reply(`パスワードが間違っているか、復号化にエラーが発生しました。`);
                }
                if (stderr) {
                    console.error(`stderr: ${stderr}`);
                    return interaction.reply(`Error:${stderr}`);
                }

                const decryptedContent = fs.readFileSync(decryptedFilePath, 'utf8');
                interaction.reply(`復号化された内容:\n\`\`\`${decryptedContent}\`\`\``);

                // 復号化されたファイルを削除
                fs.unlinkSync(encryptedFilePath);
                fs.unlinkSync(decryptedFilePath);
            });
        })
        .catch(err => {
            console.error(`File download error: ${err}`);
            interaction.reply(`Error:${err}`);
        });
}
if (interaction.commandName === 'translator') {
  const text = interaction.options.getString('text');
  const lang = interaction.options.getString('lang');

  try {
      const result = await translator.translateText(text, null, lang);
      await interaction.reply('翻訳した内容:\n```' + `${result.text}` + '```');
  } catch (err) {
      console.error(`Translation error: ${err.message}`);
      await interaction.reply(`Error: ${err.message}`);
  }
}

if (interaction.commandName === 'random-timeout') {
  await interaction.deferReply();
  // タイムアウト権限のチェック
  if (!interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      await interaction.editReply('タイムアウト権限がありません。管理者権限を持つユーザーにつけてもらってください。');
      return;
  }
  // 10秒から1分間タイムアウト
  const randomTimeoutSeconds = Math.floor(Math.random() * (60 - 10 + 1)) + 10;

  // サーバー内の全てのメンバーを取得
  const members = await interaction.guild.members.fetch();

  // Botと一定の権限以上のメンバーを除外
  const eligibleMembers = members.filter(member => 
      !member.user.bot && !member.permissions.has(PermissionsBitField.Flags.ModerateMembers)
  );
  if (eligibleMembers.size === 0) {
    await interaction.editReply('タイムアウト可能なメンバーが見つかりませんでした。');
    return;
  }
  // ランダムに対象メンバーを選択
  const randomMember = eligibleMembers.random();
  // タイムアウトを実行（GuildMember.timeout() を使用）
  await randomMember.timeout(randomTimeoutSeconds * 1000, "Random timeout command");
  await interaction.editReply(`ランダムに選ばれたメンバー <@${randomMember.id}> を ${randomTimeoutSeconds}秒間タイムアウトしました！`);
}

if (interaction.commandName === 'dice') {
  const sides = interaction.options.getInteger('sides');
  const qty = interaction.options.getInteger('count');
  const results = [];
  for (let i = 0; i < qty; i++) {
      results.push(Math.floor(Math.random() * sides) + 1);
  }
  const total = results.reduce((a, b) => a + b, 0);
  await interaction.reply(`${sides}面サイコロを${qty}個振りました！\n ${results.join(', ')}\n合計: ${total}`);
}

if (interaction.commandName === 'poll') {
  const question = interaction.options.getString('question');
  let description = interaction.options.getString('description');
  if (!description || description.length === 0) {
      description = '匿名投票を開始します。';
  }
  const options = interaction.options.getString('options').split(',').map(opt => opt.trim());
  const duration = interaction.options.getInteger('duration') || 10;

  if (options.length < 2 || options.length > 4) {
      await interaction.reply('選択肢は2～4個まで作成可能です。');
      return;
  }
  if (options.some(option => option === '')) {
      await interaction.reply('選択肢は空にできません。');
      return;
  }

  const pollId = `poll_${interaction.id}`;
  console.log(`生成された pollId: ${pollId}`);
  
  const votes = new Map();
  activePolls.set(pollId, { options, votes, ended: false, message: null });
  
  const buttons = options.map((option, index) => ({
      type: 2,
      label: option,
      style: 1,
      custom_id: `${pollId}_${index}`
  }));

  const row = { type: 1, components: buttons };
  const embed = {
      title: question,
      description: `**匿名投票** \n\n${description}`,
      color: 0x00ff00,
      fields: options.map((option, index) => ({
          name: `選択肢 ${index + 1}`,
          value: option,
      })),
      footer: { text: `投票は ${duration} 分後に終了します。 Poll ID:${pollId}` }
  };

  const message = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
  activePolls.get(pollId).message = message;

  const collector = interaction.channel.createMessageComponentCollector({
      filter: i => i.customId.startsWith(pollId),
      time: duration * 60 * 1000
  });

  collector.on('collect', async i => {
      const poll = activePolls.get(pollId);
      if (!poll || poll.ended) {
          await i.reply({ content: 'すでに投票は終了しました！', flags: MessageFlags.Ephemeral });
          return;
      }
      
      const selectedIndex = i.customId.split('_').pop();
      const previousVote = votes.get(i.user.id);
      
      if (previousVote === selectedIndex) {
          await i.reply({ content: 'すでにこの選択肢に投票しています！', flags: MessageFlags.Ephemeral });
          return;
      }

      votes.set(i.user.id, selectedIndex);
      await i.reply({ content: '投票を受け付けました！', flags: MessageFlags.Ephemeral });
  });

  collector.on('end', async () => {
      if (activePolls.has(pollId)) {
          await endPoll(interaction, pollId);
      }
  });
}

if (interaction.commandName === 'end-poll') {
  let pollId = interaction.options.getString('poll_id');
  if (!pollId) {
      await interaction.reply('投票ID(Poll ID)を指定してください。');
      return;
  }
  pollId = pollId.trim();
  
  if (!activePolls.has(pollId)) {
      await interaction.reply('無効な投票ID(Poll ID)です。');
      return;
  }
  
  await interaction.deferReply();
  await endPoll(interaction, pollId);
}

async function endPoll(interaction, pollId) {
  const poll = activePolls.get(pollId);
  if (!poll) return;
  if (poll.ended === true) return;

  poll.ended = true;
  const { options, votes, message } = poll;
  const totalVotes = votes.size;
  const results = Array(options.length).fill(0);
  votes.forEach(choice => results[choice]++);

  let resultMessage = '投票が終了しました！ 集計結果:\n```';
  options.forEach((option, index) => {
      const percentage = totalVotes > 0 ? ((results[index] / totalVotes) * 100).toFixed(2) : 0;
      resultMessage += `選択肢 ${index + 1}: ${option} - ${results[index]} 票(${percentage}%)\n`;
  });
  resultMessage += '```';

  const disabledButtons = options.map((option, index) => ({
      type: 2,
      label: option,
      style: 1,
      custom_id: `${pollId}_${index}`,
      disabled: true
  }));

  const disabledRow = { type: 1, components: disabledButtons };

  try {
      if (message) {
          await message.edit({ components: [disabledRow] });
      }
      await interaction.followUp({ content: resultMessage });
  } catch (error) {
      console.error('投票結果の送信に失敗しました:', error);
  }
}

  if (interaction.commandName === 'snap-tweet') {
    const tweetUrl = interaction.options.getString('tweeturl');
    if (!tweetUrl) {
        await interaction.reply('ツイートのURLを指定してください。');
        return;
    }
    
    await interaction.deferReply();
    
    const tweetDir = path.join(__dirname, 'tweet');
    if (!fs.existsSync(tweetDir)) {
        fs.mkdirSync(tweetDir, { recursive: true });
    }
    
    try {
        const snap = getSnapAppRender({ url: tweetUrl });
        const font = await snap.getFont();
        const session = await snap.login({ sessionType: 'guest' });
        const render = await snap.getRender({ limit: 1, session });
        
        // snap.run はコールバック形式で実行する必要があるので、Promise でラップする
        const res = await new Promise((resolve, reject) => {
            snap.run(render, async (run) => {
                try {
                    const result = await run({
                        width: 650,
                        theme: 'RenderOceanBlueColor',
                        font,
                        output: path.join(tweetDir, '{id}-{count}.png')
                    });
                    resolve(result);
                } catch (err) {
                    reject(err);
                }
            });
        });
        
        if (!res || !res.file || !res.file.path) {
          throw new Error('画像の生成結果が正しく取得できませんでした。');
        }
        
        const imagePath = res.file.path.toString();
        console.log(Date.now.toLocaleString + ':[TweetSnap]:Generated image path:', imagePath);
        await interaction.editReply({
          files: [{ 
            attachment: fs.createReadStream(imagePath), 
            name: 'tweet.png' 
          }]
        });
        await res.file.tempCleanup();
    } catch (error) {
        console.error(`Error in snap-tweet: ${error.message}`);
        await interaction.editReply(`Generate Image Error: ${error.message}`);
    }
  }

  if (interaction.commandName === 'generate-trip') {
    const tripkey = interaction.options.getString('tripkey');
    if (!tripkey) {
        await interaction.reply({ content:'トリップキーを指定してください。', flags: MessageFlags.Ephemeral });
        return;
    }
    const trip = generateTrip(tripkey);
    await interaction.reply(`生成されたトリップ: ${trip}`);
  }

  if (interaction.commandName === 'screenshot') {
    const url = interaction.options.getString('url');
    const width = interaction.options.getInteger('width') || 1280;
    const height = interaction.options.getInteger('height') || 720;

    await interaction.deferReply();
    const screenshotDir = path.join(__dirname, 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
    }
    const screenshotPath = path.join(screenshotDir, `screenshot-${Date.now()}.png`);
    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.setViewport({ width, height });
        await page.goto(url, { waitUntil: 'networkidle2' });
        await page.screenshot({ path: screenshotPath});
        await browser.close();

        await interaction.editReply({
            files: [{
                attachment: screenshotPath,
                name: 'screenshot.png'
            }]
        });
    } catch (error) {
        console.error(`Error in screenshot command: ${error.message}`);
        await interaction.editReply(`Screenshot Error: ${error.message}`);
    }
  }

  if (interaction.commandName === 'embedbuilder') {
    const title = interaction.options.getString('title') || 'Embed Title';
    const description = interaction.options.getString('description') || 'Embed Description';
    const color = interaction.options.getString('color') || '#00ff00';
    const fields = interaction.options.getString('fields') || ''; // name1:value1,name2:value2,...
    let fieldArray = [];
    if (fields !== '') {
        const splittedFields = fields.split(',');
        for (const field of splittedFields) {
            if (!field.includes(':')) {
                await interaction.reply({ content: 'fieldsの形式が正しくありません。例: "name1:value1,name2:value2"', flags: MessageFlags.Ephemeral});
                return;
            }
        }
        fieldArray = splittedFields.map(field => {
            const [name, value] = field.split(':').map(part => part.trim());
            console.log(`Field name: ${name}, value: ${value}`);
            return { name, value, inline: true };
        });
    }
    const Imageattachment = interaction.options.getAttachment('image');
    const ImageattachmentURL = Imageattachment ? Imageattachment.url : null;
    
    const embed = {
        title: title,
        description: description,
        color: parseInt(color.replace('#', '0x'), 16),
        fields: fieldArray,
        image: ImageattachmentURL ? { url: ImageattachmentURL } : undefined,
        footer: {
            text: 'Embed Builder by PiriBot',
            icon_url: client.user.displayAvatarURL()
        }
    };
    
    await interaction.reply({ embeds: [embed] });
  }

  // Make it Quoteの画像を生成するコンテキストメニューコマンド
  if (interaction.isContextMenuCommand() && interaction.commandName === 'Make it a Quoteの作成(モノクロ)') {
    const targetMessage = await interaction.channel.messages.fetch(interaction.targetId);
    const targetUser = targetMessage.author;
    const targetUserName = targetUser.username;
    const targetUserDisplayName = targetUser.displayName;
    const targetUserIconURL = targetUser.displayAvatarURL({ format: 'png', size: 128 });

    if (!targetMessage) {
        await interaction.reply({ content: '指定されたメッセージが見つかりません。', flags: MessageFlags.Ephemeral });
        return;
    }
    const imageurl = await generateMiqImages(
        targetUserName,
        targetUserDisplayName,
        targetMessage.content,
        targetUserIconURL,
        false
    )

    await interaction.deferReply();
    await interaction.editReply({
      files: [{
        attachment: imageurl,
        name: 'quote-mono.png'
    }]
  });
  }

    if (interaction.isContextMenuCommand() && interaction.commandName === 'Make it a Quoteの作成(カラー)') {
    const targetMessage = await interaction.channel.messages.fetch(interaction.targetId);
    const targetUser = targetMessage.author;
    const targetUserName = targetUser.username;
    const targetUserDisplayName = targetUser.displayName;
    const targetUserIconURL = targetUser.displayAvatarURL({ format: 'png', size: 128 });

    if (!targetMessage) {
        await interaction.reply({ content: '指定されたメッセージが見つかりません。', flags: MessageFlags.Ephemeral });
        return;
    }
    const imageurl = await generateMiqImages(
        targetUserName,
        targetUserDisplayName,
        targetMessage.content,
        targetUserIconURL,
        true
    )

    await interaction.deferReply();
    await interaction.editReply({
      files: [{
        attachment: imageurl,
        name: 'quote-color.png'
    }]
  });
  }

  if (interaction.isContextMenuCommand() && interaction.commandName === 'ユーザーアイコンの取得') {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const embed = {
        title: `${targetUser.displayName}のアイコン`,
        color: 0x00ff00,
        image: { url: targetUser.displayAvatarURL({ format: 'png', size: 512 }) },
}
    
    await interaction.reply({ embeds: [embed] });
  }

  if (interaction.isContextMenuCommand() && interaction.commandName === 'ユーザー情報の取得') {
    const targetUser = interaction.options.getUser('user') || interaction.user; // interactionとしてのuser
    const targetMember = await interaction.guild.members.fetch(targetUser.id); // guildとしてのuser

    // ステータスを指定の表記と絵文字に変換する関数
    const mapStatus = (status) => {
        switch(status) {
            case 'online':
                return '🟢オンライン';
            case 'idle':
                return '🌙退席中';
            case 'dnd':
                return '🔴取り込み中';
            default:
                return status || '情報なし';
        }
    };

    // 全体ステータス
    const overallStatus = mapStatus(targetMember.presence?.status);

    // 端末ごとのステータス
    const clientStatus = targetMember.presence?.clientStatus;
    let clientStatusText = '';
    if (clientStatus) {
        if (clientStatus.desktop) clientStatusText += `💻デスクトップ\n`;
        if (clientStatus.mobile) clientStatusText += `📱モバイル\n`;
        if (clientStatus.web) clientStatusText += `🌐ウェブ\n`;
    } else {
        clientStatusText = '情報なし';
    }

    const embed = {
        title: `${targetMember.displayName}のユーザー情報`,
        color: 0x00ff00,
        fields: [
            { name: 'ユーザー名', value: targetUser.username, inline: true },
            { name: 'ニックネーム', value: targetMember.nickname || 'なし', inline: true },
            { name: 'ユーザーID', value: targetUser.id, inline: true },
            { name: 'ステータス情報', value: `${overallStatus}\n${clientStatusText}`, inline: false },
            { name: 'アカウント作成日', value: `${targetUser.createdAt.toLocaleString()}\n (${Math.floor((Date.now() - targetUser.createdAt) / (1000 * 60 * 60 * 24))}日前)`, inline: true },
            { name: 'サーバー参加日', value: `${targetMember.joinedAt.toLocaleString()}\n (${Math.floor((Date.now() - targetMember.joinedAt) / (1000 * 60 * 60 * 24))}日前)`, inline: true },
        ],
        thumbnail: { url: targetUser.displayAvatarURL({ format: 'png', size: 128 }) }
    };
    
    await interaction.reply({ embeds: [embed] });
  }

})


client.login(process.env.DISCORD_TOKEN);
