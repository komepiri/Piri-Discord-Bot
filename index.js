import { Client, GatewayIntentBits, PresenceUpdateStatus, ActivityType, MessageFlags, PermissionsBitField } from "discord.js";
import { exec } from 'child_process';
import ModelClient from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from "url";
import * as deepl from 'deepl-node';
import express from 'express';
import { Ollama } from 'ollama';

const app = express();
const port = 3000

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

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
const endpoint = "https://models.inference.ai.azure.com";

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
      model: 'hf.co/SakanaAI/TinySwallow-1.5B-Instruct-GGUF:Q8_0', // Sakana AI(日本企業)のモデル
      messages: conversation
  });

  return response.message;

} 

if (modelName === "sarashina2.2-3b-instruct-v0.1") {
  const ollama = new Ollama();

  let conversation = loadConversations(channelId);
  const response = await ollama.chat({
    model: 'hf.co/mmnga/sarashina2.2-3b-instruct-v0.1-gguf', // SB Intuitionsのモデル
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
  
  return response.body.choices[0].message;
}}

client.once('ready', async () => {
  const rawData = fs.readFileSync(path.join(__dirname, 'command-settings.json'), 'utf-8');
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
  const systemMessage = { role: "system", content: `You are a Bot AI running on Discord, named Piri Bot (<@1275786474805002341>). The language model is ${models}. You will be sent a message in the format of “name:content”, so please respond to the content.` };

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


client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // メッセージを保存
    if (trackedUsers[message.author.id]) {
      const userFilePath = path.join(userMessageDir, `${message.author.id}.txt`);
      fs.appendFileSync(userFilePath, `${message.createdAt}: ${message.content}\n`);
  }

    // GitHub ModelsでAIに回答させる
    const channels = loadChannelSettings();
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

          const text = await generateWithGitHubModelsAndOllama(targetChannelId, model ,`${username}:${message.content}`);

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
  
    if (interaction.commandName === 'komegen') {
      await interaction.reply({
        content: 'coming soon...',
        flags: MessageFlags.Ephemeral
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
        console.log(`channel set ${interaction.guild.id} / ${targetChannel.id} successfully.`);
    }

    if (interaction.commandName === 'ai_delchannel') {
      const channels = loadChannelSettings();
      if (channels.channels[interaction.guild.id]) {
          const targetChannel = channels.channels[interaction.guild.id].channelId;
          delete channels.channels[interaction.guild.id];
          saveChannelSettings(channels);
          await interaction.reply(`<#${targetChannel}>の自動応答設定が削除されました。\n今までの会話記録をリセットする場合は、ai_conv_resetコマンドを使用してください。`);
          console.log(`delete channel ${interaction.guild.id} / ${targetChannel} successfully.`);
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
            console.log(`change model ${interaction.guild.id} / ${model} successfully.`);
        } else {
            await interaction.reply('このチャンネルには自動応答が有効化されていません。');
            console.log(`channel ${interaction.guild.id} not found.`);
        }
    }

    if (interaction.commandName === 'ai_conv_reset') {
        const channels = loadChannelSettings();
            const channelFilePath = path.join(__dirname, 'conversations', `${interaction.channel.id}.json`);
            if (fs.existsSync(channelFilePath)) {
                fs.unlinkSync(channelFilePath);
                await interaction.reply(`<#${interaction.channel.id}>の会話記録をリセットしました。`);
                console.log(`reset conversation ${interaction.guild.id} / ${interaction.channel.id} successfully.`);
            } else {
                await interaction.reply('会話記録が見つかりません。');
                console.log(`conversation ${interaction.guild.id} / ${interaction.channel.id} not found.`);
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
        console.log(`channel ${interaction.guild.id} not found.`);
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
    await interaction.reply(`ボットの起動時間: ${uptimeDays}日 ${uptimeHours}時間 ${uptimeMinutes}分 ${uptimeSeconds}秒`); 
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
            },
            {
                name: 'API URL',
                value: `http://127.0.0.1:3000/status`
            }
        ]
    }
    await interaction.reply({ embeds: [embed] });
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
                    return interaction.reply(`パスワードが間違っているか、エラーが発生しました。`);
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
      await interaction.editReply('タイムアウト権限がありません。管理者につけてもらってください。');
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

})

client.login(process.env.DISCORD_TOKEN);
