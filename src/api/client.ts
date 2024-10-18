import axios, { AxiosInstance } from "axios";
import https from "https";
import fs from "fs";
import {
  API_BASE_URL,
  API_TOKEN,
  CLIENT_CERT_PATH,
  CLIENT_KEY_PATH,
  CA_CERT_PATH,
} from "../config";

export interface ApiClient {
  get(url: string): Promise<any>;
  post(url: string, data: any): Promise<any>;
}

export class FireflyApiClient implements ApiClient {
  private client: AxiosInstance;

  constructor() {
    const httpsAgent = new https.Agent({
      cert: fs.readFileSync(CLIENT_CERT_PATH),
      key: fs.readFileSync(CLIENT_KEY_PATH),
      ca: fs.readFileSync(CA_CERT_PATH),
    });

    this.client = axios.create({
      baseURL: API_BASE_URL,
      httpsAgent,
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });
  }

  async get(url: string): Promise<any> {
    const response = await this.client.get(url);
    return response.data;
  }

  async post(url: string, data: any): Promise<any> {
    const response = await this.client.post(url, data);
    return response.data;
  }
}
