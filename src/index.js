import dotenv from "dotenv";
import { Client, GatewayIntentBits, MessageFlags } from "discord.js";

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.on("messageCreate", async (message) => {
  try {
    const { author, content } = message;

    if (author.bot) return;

    const postRegex =
      /(https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/[A-Za-z0-9_]+\/status\/\d+)/i;

    const match = content.match(postRegex);

    if (!match) return;

    const fullLink = match[0];

    const fxLink = fullLink
      .replace("twitter.com", "api.fxtwitter.com")
      .replace("x.com", "api.fxtwitter.com");

    const res = await fetch(fxLink);

    const data = await res.json();

    if (!res.ok) {
      console.log(res);
      console.log(data);
      throw new Error(`${res.statusText} (${res.status})`);
    }

    await sendTweetToDiscord(data, message);
  } catch (err) {
    console.error(err);
  }
});

async function sendTweetToDiscord(data, message) {
  const { media, url } = data.tweet;

  const { author, channel } = message;

  const webhook = await getOrCreateWebhook(channel);
  // Prepare attachments (buffers)
  const attachments = [];

  if (!media?.photos?.length) return;

  for (const [i, photo] of media.photos.entries()) {
    const res = await fetch(photo.url);
    const buffer = Buffer.from(await res.arrayBuffer());

    attachments.push({
      attachment: buffer,
      name: `tweet_image_${i + 1}.webp`,
    });
  }

  await webhook.send({
    username: `${author.username}`,
    avatarURL: author.displayAvatarURL(),
    content: `${url}`,
    files: attachments,
    flags: MessageFlags.SuppressEmbeds,
  });

  await message.delete();
}

async function getOrCreateWebhook(channel) {
  const webhooks = await channel.fetchWebhooks();

  let webhook = webhooks.find((wh) => wh.owner?.id === client.user.id);

  if (!webhook) {
    webhook = await channel.createWebhook({
      name: "Tweet Relay",
      avatar: "https://abs.twimg.com/icons/apple-touch-icon-192x192.png",
    });
  }

  return webhook;
}
client.login(process.env.TOKEN);
