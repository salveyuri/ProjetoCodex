import axios from "axios";

const resolveApiBaseUrl = (): string => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:3001/api`;
  }

  return "http://localhost:3001/api";
};

export const API_BASE_URL = resolveApiBaseUrl();

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 5000,
  headers: {
    "Content-Type": "application/json",
  },
});
