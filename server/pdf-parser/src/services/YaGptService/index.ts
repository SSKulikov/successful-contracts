import axios from "axios";
import { logger } from "../../utils/logger";
import dotenv from "dotenv";

dotenv.config();

const MAX_REQUEST_ATTEMPT = 3;

export class YaGptService {
  private oAuthToken: string;
  private bearerToken: string;
  private folderId: string;

  constructor() {
    this.oAuthToken = process.env.OAUTH_TOKEN ?? "";
    this.bearerToken = process.env.BEARER_TOKEN ?? "";
    this.folderId = process.env.FOLDER_ID ?? "";
  }

  async main() {}

  private async getAccessToken() {
    if (!this.oAuthToken && this.bearerToken) {
      return;
    }
    if (!this.oAuthToken) {
      throw new Error(
        "Не задан OAUTH_TOKEN и отсутствует BEARER_TOKEN для YaGptService"
      );
    }

    const data = { yandexPassportOauthToken: this.oAuthToken };
    const url = "https://iam.api.cloud.yandex.net/iam/v1/tokens";
    const result = await axios.request({
      method: "post",
      maxBodyLength: Infinity,
      url,
      headers: {
        "Content-Type": "application/json",
      },
      data,
    });

    this.bearerToken = result.data.iamToken;
  }

  async makeRequest(text: string, request: string) {
    if (!this.folderId) {
      throw new Error("Не задан FOLDER_ID для YaGptService");
    }

    let dataResult = null;
    let attempt = 0;

    while (attempt < MAX_REQUEST_ATTEMPT) {
      attempt++;
      try {
        logger.info(
          `Попытка запроса к YaGPT №${attempt} из ${MAX_REQUEST_ATTEMPT}`
        );

        await this.getAccessToken();

        const data = JSON.stringify({
          modelUri: `gpt://${this.folderId}/yandexgpt/latest`,
          completionOptions: {
            stream: false,
            temperature: 0.6,
            maxTokens: "2000",
            reasoningOptions: {
              mode: "DISABLED",
            },
          },
          messages: [
            {
              role: "system",
              text: request,
            },
            {
              role: "user",
              text,
            },
          ],
        });

        const config = {
          method: "post",
          maxBodyLength: Infinity,
          url: "https://llm.api.cloud.yandex.net/foundationModels/v1/completion",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.bearerToken}`,
            "x-folder-id": this.folderId,
          },
          data,
        };

        const result = await axios.request(config);
        const cleanText = result.data.result.alternatives[0].message.text
          .replace(/```/g, "")
          .trim();

        // Парсим чистую строку
        dataResult = JSON.parse(cleanText);
        break;
      } catch (err) {
        console.error(err);
        logger.error(`Ошибка при запросе к YaGPT: ${err}`);
      }
    }
    return dataResult;
  }
}
