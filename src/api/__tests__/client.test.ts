import { FireflyApiClient } from "../client";
import axios from "axios";
import https from "https";

jest.mock("axios");
jest.mock("https");
jest.mock("fs", () => ({
  readFileSync: jest.fn().mockReturnValue("mock-cert-content"),
  existsSync: jest.fn().mockReturnValue(true),
}));

// Mock environment variables
process.env.FIREFLY_API_TOKEN = "mock-api-token";
process.env.CLIENT_CERT_PATH = "/mock/path/client.crt";
process.env.CLIENT_KEY_PATH = "/mock/path/client.key";
process.env.CA_CERT_PATH = "/mock/path/ca.crt";

describe("FireflyApiClient", () => {
  let client: FireflyApiClient;

  beforeEach(() => {
    jest.clearAllMocks();
    (axios.create as jest.Mock).mockReturnValue({
      get: jest.fn(),
      post: jest.fn(),
    });
    client = new FireflyApiClient();
  });

  it("should create an instance with correct configuration", () => {
    expect(https.Agent).toHaveBeenCalledWith({
      cert: "mock-cert-content",
      key: "mock-cert-content",
      ca: "mock-cert-content",
    });

    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: expect.any(String),
        httpsAgent: expect.any(https.Agent),
        headers: expect.objectContaining({
          Authorization: expect.stringContaining("Bearer "),
          "Content-Type": "application/json",
          Accept: "application/json",
        }),
      })
    );
  });

  it("should make a GET request", async () => {
    const mockResponse = { data: "test data" };
    (client as any).client.get.mockResolvedValue(mockResponse);

    const result = await client.get("/test");

    expect(client["client"].get).toHaveBeenCalledWith("/test");
    expect(result).toBe("test data");
  });

  it("should make a POST request", async () => {
    const mockResponse = { data: "test data" };
    (client as any).client.post.mockResolvedValue(mockResponse);

    const result = await client.post("/test", { foo: "bar" });

    expect(client["client"].post).toHaveBeenCalledWith("/test", { foo: "bar" });
    expect(result).toBe("test data");
  });
});
