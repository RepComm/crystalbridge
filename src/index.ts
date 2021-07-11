
import Discord, { Message }  from "discord.js";
import { readFile } from "fs";
import { Bridge } from "./bridge.js";

const TEXT_DECODER = new TextDecoder();

function getFileAsString (fname: string): Promise<string> {
  return new Promise( async (_resolve, _reject)=>{
    readFile(fname, (err, data)=>{
      if (err) {
        _reject(err);
        return;
      }
      let result = TEXT_DECODER.decode(data);
      _resolve(result);
      return;
    });
  });
}

interface MessageActionCallback {
  (msg: Message): void;
}
const RANDOM_ACTIONS: Array<MessageActionCallback> = [
  (msg) => {
    let randomDigit = Math.floor(Math.random()*10);
    msg.channel.send(`Heres a random digit of pi for you: ${randomDigit}. You know, from somewhere in the middle?`);
  },
  (msg) => {
    msg.channel.send("Here.. :bomb: you dropped this. Anywho, seeya");
  },
  (msg) => {
    msg.channel.send("stfu");
  },
  (msg) => {
    msg.channel.send("dafug ya want bish");
  },
  (msg) => {
    msg.channel.send("I suppose I should reply pong.");
  }
];
function getRandomAction (): MessageActionCallback {
  return RANDOM_ACTIONS[ Math.floor( Math.random() * RANDOM_ACTIONS.length ) ];
}

interface BridgeMessageJson {
  type: "chat";

  chatUser?: string;
  chatMessage?: string;
}

function getEmoji (client: any, id: string): string {
  return client.emojis.cache?.find(emoji => emoji.name == id);
}

async function main () {

  //create a web socket bridge (reconnecting client)
  const bridge = new Bridge();
  
  const client = new Discord.Client();

  let CHANNEL_ID = await getFileAsString("./discord-channel-id.txt");
  console.log("Read channel id", CHANNEL_ID);
  
  let channel: Discord.Channel;

  
  client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);

    //Set our host
    bridge.setHost("localhost", 10209);

    if (CHANNEL_ID) channel = client.channels.cache.get(CHANNEL_ID);

    bridge.on("message", (msg)=>{
      console.log("Got message from bridge ws", msg);
      if (!channel) {
        console.warn("Cannot deliver bridge json, no channel is linked. use !channel in the desired channel to get its id, then set discord-channel-id.txt content to that.");
        return;
      }

      let json: BridgeMessageJson;

      try {
        json = JSON.parse(msg);
      } catch (ex) {
        console.warn("Couldn't parse json", ex);
        return;
      }

      if (json.type === "chat") {
        if (channel.isText()) {
          channel.send(`\:video_game: <${json.chatUser}> ${json.chatMessage}`);
        }
      }
    });
    

    bridge.on("state", (old, current)=>{
      if (current === "open") {
        setTimeout(()=>{
          client.user.setActivity(`Bridge state ${current}`);
        }, 500);
      } else {
        client.user.setActivity(`Bridge state ${current}`);
      }
    });
    bridge.setDesiredState("open");

  });

  client.on('message', message => {
    if(message.author.id === client.user.id) return;
    if (message.channel.type !== "text") return;
    if (message.channel.name !== "minecraft") return;

    if (message.content === '!ping') {
      getRandomAction()(message);
    } else if (message.content === "!channel") {
      let id = message.channel.id;
      message.channel.send(`Channel id is ${id}`);
      message.delete();
    }

    let data: BridgeMessageJson = {
      type: "chat",
      chatUser: message.author.username,
      chatMessage: message.content
    };
    let str = JSON.stringify(data);
    bridge.send(str);
  });
  
  let token = await getFileAsString("./discord-secret-token.txt");

  client.login(token);
}

main();
