import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sendSuccess } from "../../utils/response.js";
import { AppError } from "../../utils/errors.js";

const redditSubredditSchema = z.object({
  subreddit: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_]+$/),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(["hot", "new", "top", "rising"]).default("hot"),
});

const youtubeChannelSchema = z.object({
  channelId: z.string().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(15),
});

const twitterProfileSchema = z.object({
  username: z.string().min(1).max(100),
});

interface RedditPost {
  title: string;
  author: string;
  score: number;
  url: string;
  permalink: string;
  numComments: number;
  createdUtc: number;
  selftext: string;
  subreddit: string;
}

interface RedditChild {
  data: {
    title: string;
    author: string;
    score: number;
    url: string;
    permalink: string;
    num_comments: number;
    created_utc: number;
    selftext: string;
    subreddit: string;
  };
}

interface RedditResponse {
  data: {
    children: RedditChild[];
    after: string | null;
  };
}

export async function socialDataRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/social/twitter/profile
  app.post("/twitter/profile", async (request, reply) => {
    const params = twitterProfileSchema.parse(request.body);

    sendSuccess(reply, {
      platform: "twitter",
      data: {
        username: params.username,
        status: "coming_soon",
        message: "Twitter/X API integration is coming soon. Direct API access requires an approved developer account.",
      },
      cached: false,
      timestamp: new Date().toISOString(),
    });
  });

  // POST /v1/social/reddit/subreddit
  app.post("/reddit/subreddit", async (request, reply) => {
    const params = redditSubredditSchema.parse(request.body);

    let data: RedditResponse;
    try {
      const response = await fetch(
        `https://www.reddit.com/r/${params.subreddit}/${params.sort}.json?limit=${params.limit.toString()}`,
        {
          headers: {
            "User-Agent": "AgentUtilityBelt/1.0",
          },
          signal: AbortSignal.timeout(10000),
        },
      );

      if (!response.ok) {
        throw new AppError(502, "REDDIT_ERROR", `Reddit returned HTTP ${response.status.toString()}`);
      }

      data = (await response.json()) as RedditResponse;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(502, "REDDIT_ERROR", `Failed to fetch Reddit data: ${error instanceof Error ? error.message : "Unknown error"}`);
    }

    const posts: RedditPost[] = data.data.children.map((child) => ({
      title: child.data.title,
      author: child.data.author,
      score: child.data.score,
      url: child.data.url,
      permalink: `https://www.reddit.com${child.data.permalink}`,
      numComments: child.data.num_comments,
      createdUtc: child.data.created_utc,
      selftext: child.data.selftext.slice(0, 500),
      subreddit: child.data.subreddit,
    }));

    sendSuccess(reply, {
      platform: "reddit",
      data: {
        subreddit: params.subreddit,
        sort: params.sort,
        posts,
        count: posts.length,
      },
      cached: false,
      timestamp: new Date().toISOString(),
    });
  });

  // POST /v1/social/youtube/channel
  app.post("/youtube/channel", async (request, reply) => {
    const params = youtubeChannelSchema.parse(request.body);

    let xml: string;
    try {
      const response = await fetch(
        `https://www.youtube.com/feeds/videos.xml?channel_id=${params.channelId}`,
        {
          headers: { "User-Agent": "AgentUtilityBelt/1.0" },
          signal: AbortSignal.timeout(10000),
        },
      );

      if (!response.ok) {
        throw new AppError(502, "YOUTUBE_ERROR", `YouTube returned HTTP ${response.status.toString()}`);
      }

      xml = await response.text();
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(502, "YOUTUBE_ERROR", `Failed to fetch YouTube data: ${error instanceof Error ? error.message : "Unknown error"}`);
    }

    // Parse XML manually (lightweight, no extra dep)
    const titleMatch = xml.match(/<title>([^<]*)<\/title>/);
    const channelTitle = titleMatch?.[1] ?? "Unknown";

    const entries: Array<{ title: string; videoId: string; url: string; published: string; description: string }> = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match: RegExpExecArray | null;

    while ((match = entryRegex.exec(xml)) !== null && entries.length < params.limit) {
      const entry = match[1] ?? "";
      const videoTitle = entry.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
      const videoId = entry.match(/<yt:videoId>([^<]*)<\/yt:videoId>/)?.[1] ?? "";
      const published = entry.match(/<published>([^<]*)<\/published>/)?.[1] ?? "";
      const description = entry.match(/<media:description>([^<]*)<\/media:description>/)?.[1] ?? "";

      entries.push({
        title: videoTitle,
        videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        published,
        description: description.slice(0, 300),
      });
    }

    sendSuccess(reply, {
      platform: "youtube",
      data: {
        channelId: params.channelId,
        channelTitle,
        videos: entries,
        count: entries.length,
      },
      cached: false,
      timestamp: new Date().toISOString(),
    });
  });
}
