import { Client, GatewayIntentBits, PresenceUpdateStatus, ActivityType } from "discord.js";
import { exec }from 'child_process';
import ModelClient from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from "url";
import * as deepl from 'deepl-node';

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

const authKey = process.env["DEEPL_TOKEN"] // Replace with your key
const translator = new deepl.Translator(authKey);

// デフォルトステータスメッセージ
let StatusMessages = "PiriBot";

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
  
  return response.body.choices[0].message;
}

  client.once('ready', async () => {
    const data = [{
      name: "komegen",
      description: "こめぴりが言ってそうなことを生成します。"
    },
    {
      name: "ai_setchannel",
      description: "AIが常に返答するチャンネルを設定します。",
      options: [
        {
          type: 7, 
          name: "channel",
          description: "設定するチャンネル",
          required: true
        },
        {
          type: 3, 
          name: "model",
          description: "使用するモデルを選択",
          required: true,
          choices: [
            { name: "GPT-4o", value: "GPT-4o" },
            { name: "GPT-4o-mini", value: "GPT-4o-mini" },
            { name: "DeepSeek-R1", value: "DeepSeek-R1" },
            { name: "Phi-4", value: "Phi-4" },
            { name: "Llama-3.3-70B-Instruct", value: "Llama-3.3-70B-Instruct" }
          ]
        }
      ]
    },
    {
      name: "ai_delchannel",
      description: "自動応答のチャンネル設定を削除します。",
    },
    {
      name: "ai_model_change",
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
          { name: "Llama-3.3-70B-Instruct", value: "Llama-3.3-70B-Instruct" }
        ]
      }],
    },
    {
      name: "ai_conv_reset",
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
      name: "ai_status",
      description: "BotのAIの状態を確認します。",
    },
    {
      name: "ai_conv_exp",
      description: "今までの会話内容を出力します。",
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
    },
    {
      name: "encry",
      description: "文字列を暗号化しbase64エンコードして返します。",
      options: [{
        type: 3,
        name: "text",
        description: "暗号化する文字列",
        required: true
      },
      {
        type: 3,
        name: "password",
        description: "暗号化のパスワード",
        required: true
      }],
    },
    {
      name: "dcry",
      description: "暗号化された文字列を復号化します。",
      options: [{
        type: 11,
        name: "file",
        description: "暗号化時に発行されたファイル",
        required: true
      },
      {
        type: 3,
        name: "password",
        description: "暗号化のパスワード",
        required: true
      }],
    },
    {
      name: "translator",
      description: "指定した言語",
      options: [{
        type: 3,
        name: "text",
        description: "翻訳する文章",
        required: true
      },
      {
        type: 3,
        name: "lang",
        description: "翻訳する言語",
        required: true
      }]
    }]
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


client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // メッセージを保存
    if (trackedUsers[message.author.id]) {
      const userFilePath = path.join(userMessageDir, `${message.author.id}.txt`);
      fs.appendFileSync(userFilePath, `${message.createdAt}: ${message.content}\n`);
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
  
    if (interaction.commandName === 'komegen') {
      await interaction.reply("coming soon...")
    }

    if (interaction.commandName === 'ai_setchannel') {
        const targetChannel = interaction.options.getChannel('channel');
        const model = interaction.options.getString('model');
        const channels = loadChannels();
        channels.channels[interaction.guild.id] = {
            channelId: targetChannel.id,
            model: model
        };
        saveChannels(channels);
        await interaction.reply(`AIが自動応答するチャンネルを ${targetChannel} に設定しました。\nAIに応答してほしくない場合には「;」をメッセージの先頭につけてください。\n言語モデル: ${model}`);
        console.log(`channel set ${interaction.guild.id} / ${targetChannel.id} successfully.`);
    }

    if (interaction.commandName === 'ai_delchannel') {
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

    if (interaction.commandName === 'ai_model_change') {
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

    if (interaction.commandName === 'ai_conv_reset') {
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

    if (interaction.commandName === 'ai_status') {
      const channels = loadChannels();
      const targetChannel = channels.channels[interaction.guild.id];
      let model = '未設定';
      let currentChannelMessages = [];
      if (targetChannel) {
          model = targetChannel.model;
          currentChannelMessages = loadMessage(targetChannel.channelId);
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
      const channels = loadChannels();
      if (channels.channels[interaction.guild.id]) {
        // 会話内容をjsonでそのままファイルとして(システムメッセージを除く)送信
        const targetChannel = channels.channels[interaction.guild.id].channelId;
        const channelMessages = loadMessage(targetChannel);
        const messages = channelMessages.filter(msg => msg.role !== 'system');
        const messagesText = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
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
        await interaction.reply(`ステータスメッセージが更新されました: ${StatusMessages}`);
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

})

client.login(process.env.TOKEN);
