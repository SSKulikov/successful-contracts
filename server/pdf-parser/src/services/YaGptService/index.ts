import axios from "axios";
import { logger } from "../../utils/logger";
import dotenv from "dotenv";

dotenv.config();

const MAX_REQUEST_ATTEMPT = 3;

export class YaGptService {
  private OAuthToken: string;
  private bearerToken: string;
  private cloudId: string;
  constructor() {
    this.OAuthToken = process.env.OAUTH_TOKEN ?? "";
    this.bearerToken = "";
    this.cloudId = "";
  }

  async main() {}

  async getAccessToken() {
    let data = { yandexPassportOauthToken: this.OAuthToken };
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

  async getCloudId() {
    // logger.info("bearwwwwwerToken===>", this.bearerToken);
    const url =
      "https://resource-manager.api.cloud.yandex.net/resource-manager/v1/folders?cloudId=b1gupme08lkmf5h6m90d";
    const result = await axios.request({
      method: "get",
      maxBodyLength: Infinity,
      url,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.bearerToken}`,
      },
    });
    // logger.info(result.data);
    this.cloudId = result.data.folders[1].id;
  }

  async makeRequest(text: string, request: string) {
    let dataResult = null;
    let attempt = 0;
    while (attempt < MAX_REQUEST_ATTEMPT) {
      attempt++;
      try {
        logger.info(
          `Попытка запроса к YaGPT №${attempt} из ${MAX_REQUEST_ATTEMPT}`
        );
        await this.getAccessToken();
        await this.getCloudId();
        // logger.info("cloudId====>", this.cloudId);
        let data = JSON.stringify({
          modelUri: `gpt://${this.cloudId}/yandexgpt/latest`,
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

        let config = {
          method: "post",
          maxBodyLength: Infinity,
          url: "https://llm.api.cloud.yandex.net/foundationModels/v1/completion",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.bearerToken}`,
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
