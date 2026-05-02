import axios from "axios";
import { logger } from "../../utils/logger";
import dotenv from "dotenv";
import {allRequisitesPrompt} from "../../consts/prompts";
import GigaChat from "gigachat";
import {scheduler} from "node:timers/promises";

dotenv.config();



const MAX_REQUEST_ATTEMPT = 3;
const systemMessage = {
    role: "system",
    content: allRequisitesPrompt
};


export class GigaChatService {
    private accessKey: string;
    private giga: GigaChat;
    constructor() {
        this.accessKey = process.env.GIGA_CHAT_ACCESS_KEY || ""
        this.giga = new GigaChat({
            credentials: this.accessKey,
        });
    }

    async main() {}

    private parseModelJson(raw: string) {
        const text = String(raw ?? "").trim();
        if (!text) {
            throw new Error("Пустой ответ от модели");
        }

        const unwrapped = text.replace(/```json|```/gi, "").trim();
        const jsonStart = unwrapped.indexOf("{");
        const jsonEnd = unwrapped.lastIndexOf("}");

        if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
            throw new Error("В ответе модели не найден валидный JSON-объект");
        }

        const candidate = unwrapped.slice(jsonStart, jsonEnd + 1).trim();
        if (!candidate) {
            throw new Error("В ответе модели найден пустой JSON-кандидат");
        }

        return JSON.parse(candidate);
    }

    async makeRequest(text: string) {
        let dataResult = null;
        let attempt = 0;
        const baseDelayMs = 1000;

        while (attempt < MAX_REQUEST_ATTEMPT) {
            attempt++;
            try {
                logger.info(`Попытка запроса к GigaChat №${attempt} из ${MAX_REQUEST_ATTEMPT}`);

                const messages = [systemMessage, {
                    role: "user",
                    content: text,
                }];

                const result = await this.giga.chat({ messages });

                const raw = result?.choices[0]?.message.content;
                if (!raw) throw new Error("Не пришло ответа от ИИ");
                dataResult = this.parseModelJson(raw);
                break; // успешно
            } catch (err: any) {
                const status = err?.response?.status;

                logger.error(`Ошибка при запросе к GigaChat: ${err}`);

                if (status === 429) {
                    const retryAfter = parseInt(err.response.headers["retry-after"]) || attempt * baseDelayMs * 2;
                    logger.warn(`Слишком много запросов. Ждём ${retryAfter} мс перед повтором...`);
                    await scheduler.wait(retryAfter);
                } else {
                    await scheduler.wait(baseDelayMs * attempt); // экспоненциальная задержка
                }
            }
        }

        return dataResult;
    }
}
