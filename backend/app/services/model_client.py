"""OpenAI-compatible model client."""

import httpx

from app.config import load_config


class ModelClient:
    def __init__(self):
        self.config = load_config()

    def generate(self, system: str, user: str) -> str:
        """Call the configured chat completions endpoint."""
        url = f"{self.config['api_base'].rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.config['api_key']}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.config["model"],
            "temperature": self.config.get("temperature", 0.7),
            "max_tokens": self.config.get("max_tokens", 2048),
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        with httpx.Client(timeout=120.0) as client:
            response = client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
        return data["choices"][0]["message"]["content"]
