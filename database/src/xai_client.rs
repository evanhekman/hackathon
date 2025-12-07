// USAGE:
// $ cargo test xai_client -- --nocapture
use crate::messages::ChatCompletionRequest;
use crate::utilities::load_environment_file::get_environment_variable;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::pin::Pin;
use std::time::Duration;
use tracing::warn;

/// Default XAI API base URL
pub const DEFAULT_XAI_API_URL: &str = "https://api.x.ai/v1/chat/completions";

/// Default XAI API responses endpoint URL
pub const DEFAULT_XAI_RESPONSES_URL: &str = "https://api.x.ai/v1/responses";


/// Default timeout in seconds (3600 seconds = 1 hour)
pub const DEFAULT_TIMEOUT_SECONDS: u64 = 3600;

/// Response from XAI API chat completions endpoint
#[derive(Serialize, Deserialize, Debug)]
pub struct ChatCompletionResponse {
    pub id: Option<String>,
    pub object: Option<String>,
    pub created: Option<u64>,
    pub model: Option<String>,
    pub choices: Vec<Choice>,
    pub usage: Option<Usage>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Choice {
    pub index: Option<u32>,
    pub message: Option<MessageResponse>,
    pub finish_reason: Option<String>,
    pub delta: Option<StreamDelta>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct StreamDelta {
    pub role: Option<String>,
    pub content: Option<String>,
    /// Reasoning/thinking content (for thinking mode)
    pub reasoning_content: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct MessageResponse {
    pub role: Option<String>,
    pub content: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Usage {
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub total_tokens: Option<u32>,
}

/// Streaming chunk from XAI API
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct StreamChunk {
    pub id: Option<String>,
    pub object: Option<String>,
    pub created: Option<u64>,
    pub model: Option<String>,
    pub choices: Vec<StreamChoice>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct StreamChoice {
    pub index: Option<u32>,
    pub delta: Option<StreamDelta>,
    pub finish_reason: Option<String>,
}

/// Stream type for chat completion responses
pub type ChatCompletionStream = Pin<
    Box<dyn futures_util::Stream<Item = Result<String, Box<dyn std::error::Error + Send + Sync>>> + Send>,
>;
/// Tool type for XAI responses API
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ToolType {
    WebSearch,
    XSearch,
}

/// Tool definition for responses API
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Tool {
    #[serde(rename = "type")]
    pub tool_type: ToolType,
}

impl Tool {
    pub fn web_search() -> Self {
        Self {
            tool_type: ToolType::WebSearch,
        }
    }

    pub fn x_search() -> Self {
        Self {
            tool_type: ToolType::XSearch,
        }
    }
}

/// Input message for responses API (simpler than chat completions)
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct InputMessage {
    pub role: String,
    pub content: String,
}

impl InputMessage {
    pub fn user(content: String) -> Self {
        Self {
            role: "user".to_string(),
            content,
        }
    }
}

/// Request for XAI responses endpoint
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ResponsesRequest {
    pub model: String,
    pub input: Vec<InputMessage>,
    pub tools: Vec<Tool>,
}

impl ResponsesRequest {
    /// Create a new responses request
    pub fn new(model: String, input: Vec<InputMessage>, tools: Vec<Tool>) -> Self {
        Self {
            model,
            input,
            tools,
        }
    }

    /// Convert to JSON string
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }

    /// Convert to pretty JSON string
    pub fn to_json_pretty(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(self)
    }
}

/// Response from XAI responses endpoint
#[derive(Deserialize, Debug)]
pub struct ResponsesResponse {
    #[serde(rename = "created_at")]
    pub created_at: Option<u64>,
    pub id: Option<String>,
    #[serde(rename = "max_output_tokens")]
    pub max_output_tokens: Option<u32>,
    pub model: Option<String>,
    pub object: Option<String>,
    pub output: Option<Vec<ResponsesOutput>>,
    pub usage: Option<ResponsesUsage>,
}

#[derive(Deserialize, Debug)]
pub struct ResponsesOutput {
    #[serde(rename = "call_id")]
    pub call_id: Option<String>,
    pub input: Option<String>,
    pub name: Option<String>,
    #[serde(rename = "type")]
    pub output_type: Option<String>,
    pub id: Option<String>,
    pub status: Option<String>,
    // Some outputs might have result or content fields (content can be array or string)
    pub result: Option<serde_json::Value>,
    // Make content flexible - can be string, array, or other types
    #[serde(default)]
    pub content: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ResponsesUsage {
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub total_tokens: Option<u32>,
}

/// XAI API client for making chat completion requests
#[derive(Debug, Clone)]
pub struct XaiClient {
    api_key: String,
    base_url: String,
    timeout: Duration,
}

impl XaiClient {
    /// Create a new XAI client with default settings
    /// Loads API key from XAI_API_KEY environment variable
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        Self::with_config(None, None)
    }

    /// Create a new XAI client with custom configuration
    /// - base_url: Optional custom URL (defaults to DEFAULT_XAI_API_URL)
    /// - timeout_seconds: Optional timeout in seconds (defaults to DEFAULT_TIMEOUT_SECONDS)
    pub fn with_config(
        base_url: Option<String>,
        timeout_seconds: Option<u64>,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        let api_key = get_environment_variable("XAI_API_KEY")?;
        Ok(Self {
            api_key,
            base_url: base_url.unwrap_or_else(|| DEFAULT_XAI_API_URL.to_string()),
            timeout: Duration::from_secs(timeout_seconds.unwrap_or(DEFAULT_TIMEOUT_SECONDS)),
        })
    }

    /// Make a chat completion request
    pub async fn chat_completion(
        &self,
        request: &ChatCompletionRequest,
    ) -> Result<ChatCompletionResponse, Box<dyn std::error::Error>> {
        let client = reqwest::Client::builder().timeout(self.timeout).build()?;

        let response = client
            .post(&self.base_url)
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(request)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());

            // Check specifically for rate limiting
            if status.as_u16() == 429 {
                eprintln!(
                    "ERROR: XAI API RATE LIMITED (429)! Response: {}",
                    error_text
                );
                return Err(format!(
                    "RATE LIMITED: XAI API returned 429. Response: {}",
                    error_text
                )
                .into());
            }

            return Err(
                format!("API request failed with status {}: {}", status, error_text).into(),
            );
        }

        let completion_response: ChatCompletionResponse = response.json().await?;
        Ok(completion_response)
    }

    /// Make a responses request (with tools support)
    pub async fn responses(
        &self,
        request: &ResponsesRequest,
    ) -> Result<ResponsesResponse, Box<dyn std::error::Error>> {
        let client = reqwest::Client::builder().timeout(self.timeout).build()?;

        let response = client
            .post(DEFAULT_XAI_RESPONSES_URL)
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(request)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());

            // Check specifically for rate limiting
            if status.as_u16() == 429 {
                eprintln!(
                    "ERROR: XAI API RATE LIMITED (429)! Response: {}",
                    error_text
                );
                return Err(format!(
                    "RATE LIMITED: XAI API returned 429. Response: {}",
                    error_text
                )
                .into());
            }

            return Err(
                format!("API request failed with status {}: {}", status, error_text).into(),
            );
        }

        // Get raw response text for debugging
        let raw_text = response.text().await?;
        
        // Try to deserialize
        let responses_result: ResponsesResponse = serde_json::from_str(&raw_text).map_err(|e| {
            eprintln!("Failed to deserialize response. Raw response (first 1000 chars): {}", 
                &raw_text[..raw_text.len().min(1000)]);
            e
        })?;
        Ok(responses_result)
    }

    /// Get the timeout
    pub fn timeout(&self) -> Duration {
        self.timeout
    }

    /// Get the base URL
    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    /// Make a streaming chat completion request
    /// Returns a stream of content strings as they arrive
    pub async fn chat_completion_stream(
        &self,
        request: &ChatCompletionRequest,
    ) -> Result<ChatCompletionStream, Box<dyn std::error::Error + Send + Sync>> {
        let client = reqwest::Client::builder().timeout(self.timeout).build()?;

        // Ensure stream is enabled
        let mut stream_request = request.clone();
        stream_request.stream = Some(true);

        let response = client
            .post(&self.base_url)
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&stream_request)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());

            if status.as_u16() == 429 {
                return Err(format!(
                    "RATE LIMITED: XAI API returned 429. Response: {}",
                    error_text
                )
                .into());
            }

            return Err(
                format!("API request failed with status {}: {}", status, error_text).into(),
            );
        }

        let byte_stream = response.bytes_stream();

        let stream = async_stream::stream! {
            let mut buffer = String::new();

            tokio::pin!(byte_stream);

            while let Some(chunk_result) = byte_stream.next().await {
                match chunk_result {
                    Ok(bytes) => {
                        buffer.push_str(&String::from_utf8_lossy(&bytes));

                        // Process complete SSE lines
                        while let Some(line_end) = buffer.find('\n') {
                            let line = buffer[..line_end].trim().to_string();
                            buffer = buffer[line_end + 1..].to_string();

                            if line.is_empty() {
                                continue;
                            }

                            if line.starts_with("data: ") {
                                let data = &line[6..];

                                if data == "[DONE]" {
                                    return;
                                }

                                match serde_json::from_str::<StreamChunk>(data) {
                                    Ok(chunk) => {
                                        if let Some(choice) = chunk.choices.first() {
                                            if let Some(delta) = &choice.delta {
                                                // First check for reasoning_content (thinking mode)
                                                if let Some(reasoning) = &delta.reasoning_content {
                                                    // Wrap thinking content in a special marker
                                                    yield Ok(format!("<thinking>{}</thinking>", reasoning));
                                                }
                                                // Then check for regular content
                                                if let Some(content) = &delta.content {
                                                    yield Ok(content.clone());
                                                }
                                            }
                                        }
                                    }
                                    Err(e) => {
                                        warn!("Failed to parse stream chunk: {} - data: {}", e, data);
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        yield Err(Box::new(e) as Box<dyn std::error::Error + Send + Sync>);
                        return;
                    }
                }
            }
        };

        Ok(Box::pin(stream))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::messages::Message;
    use crate::utilities::load_environment_file::load_environment_file;

    #[tokio::test]
    async fn test_xai_client_creation() {
        // Load environment file first
        load_environment_file(None).expect("Should load .env file");

        let client = XaiClient::new().expect("Should create client");

        println!("=== XAI Client Configuration ===");
        println!("Base URL: {}", client.base_url());
        println!("Timeout: {} seconds", client.timeout().as_secs());
        // Remove the api_key line since it's private, or just print that it's loaded
        println!("API Key: [loaded]");

        assert_eq!(client.base_url(), DEFAULT_XAI_API_URL);
        assert_eq!(client.timeout().as_secs(), DEFAULT_TIMEOUT_SECONDS);
    }

    #[tokio::test]
    async fn test_chat_completion_simple() {
        // Load environment file first
        load_environment_file(None).expect("Should load .env file");

        let client = XaiClient::new().expect("Should create client");

        let messages = vec![
            Message::system("You are a helpful assistant. Respond briefly.".to_string()),
            Message::user("Say hello in one sentence.".to_string()),
        ];

        let request = ChatCompletionRequest::new(messages, "grok-4".to_string());

        println!("\n=== Making XAI API Call ===");
        println!("Model: {}", request.model);
        println!("Messages: {}", request.messages.len());
        println!("Request JSON: {}", request.to_json().unwrap());

        let response = client.chat_completion(&request).await;

        match response {
            Ok(resp) => {
                println!("\n=== API Response ===");
                println!("Model: {:?}", resp.model);
                println!("Choices: {}", resp.choices.len());
                if let Some(choice) = resp.choices.first() {
                    if let Some(msg) = &choice.message {
                        println!("Role: {:?}", msg.role);
                        println!("Content: {:?}", msg.content);
                    }
                }
                if let Some(usage) = &resp.usage {
                    println!(
                        "Usage - Prompt tokens: {:?}, Completion tokens: {:?}, Total: {:?}",
                        usage.prompt_tokens, usage.completion_tokens, usage.total_tokens
                    );
                }
            }
            Err(e) => {
                println!("\n=== API Error ===");
                println!("Error: {}", e);
                panic!("API call failed: {}", e);
            }
        }
    }

    #[tokio::test]
    async fn test_chat_completion_with_custom_model() {
        // Load environment file first
        load_environment_file(None).expect("Should load .env file");

        let client = XaiClient::new().expect("Should create client");

        let messages = vec![
            Message::system("You are Grok, a highly intelligent, helpful AI assistant.".to_string()),
            Message::user("What is the meaning of life, the universe, and everything? Answer in one sentence.".to_string()),
        ];

        // Test with explicit model and stream=false
        let request = ChatCompletionRequest::with_stream(messages, "grok-4".to_string(), false);

        println!("\n=== Making XAI API Call (Custom Config) ===");
        println!("Model: {}", request.model);
        println!("Stream: {:?}", request.stream);
        println!("Request JSON: {}", request.to_json_pretty().unwrap());

        let response = client.chat_completion(&request).await;

        match response {
            Ok(resp) => {
                println!("\n=== API Response ===");
                println!("Response ID: {:?}", resp.id);
                println!("Model: {:?}", resp.model);
                println!("Created: {:?}", resp.created);

                for (idx, choice) in resp.choices.iter().enumerate() {
                    println!("\nChoice {}:", idx);
                    println!("  Index: {:?}", choice.index);
                    println!("  Finish reason: {:?}", choice.finish_reason);
                    if let Some(msg) = &choice.message {
                        println!("  Role: {:?}", msg.role);
                        println!("  Content: {:?}", msg.content);
                    }
                }

                if let Some(usage) = &resp.usage {
                    println!("\nToken Usage:");
                    println!("  Prompt tokens: {:?}", usage.prompt_tokens);
                    println!("  Completion tokens: {:?}", usage.completion_tokens);
                    println!("  Total tokens: {:?}", usage.total_tokens);
                }
            }
            Err(e) => {
                println!("\n=== API Error ===");
                println!("Error: {}", e);
                panic!("API call failed: {}", e);
            }
        }
    }

    #[tokio::test]
    async fn test_responses_with_tools() {
        // Load environment file first
        load_environment_file(None).expect("Should load .env file");

        let client = XaiClient::new().expect("Should create client");

        let input = vec![InputMessage::user(
            "what is the latest update from xAI?".to_string(),
        )];

        let tools = vec![Tool::web_search(), Tool::x_search()];

        let request = ResponsesRequest::new("grok-4-1-fast".to_string(), input, tools);

        println!("\n=== Making XAI Responses API Call ===");
        println!("Model: {}", request.model);
        println!("Input messages: {}", request.input.len());
        println!("Tools: {:?}", request.tools);
        println!("Request JSON: {}", request.to_json_pretty().unwrap());

        let response = client.responses(&request).await;

        match response {
            Ok(resp) => {
                println!("\n=== API Response ===");
                println!("Response ID: {:?}", resp.id);
                println!("Model: {:?}", resp.model);
                println!("Created At: {:?}", resp.created_at);
                println!("Object: {:?}", resp.object);

                if let Some(output) = &resp.output {
                    println!("\nOutput items ({}):", output.len());
                    for (idx, item) in output.iter().enumerate() {
                        println!("\nOutput {}:", idx);
                        println!("  Call ID: {:?}", item.call_id);
                        println!("  Name: {:?}", item.name);
                        println!("  Type: {:?}", item.output_type);
                        println!("  ID: {:?}", item.id);
                        println!("  Status: {:?}", item.status);
                        println!("  Input: {:?}", item.input);
                        if let Some(result) = &item.result {
                            println!("  Result: {:?}", result);
                        }
                        if let Some(content) = &item.content {
                            println!("  Content: {:?}", content);
                        }
                    }
                }

                if let Some(usage) = &resp.usage {
                    println!("\nToken Usage:");
                    println!("  Prompt tokens: {:?}", usage.prompt_tokens);
                    println!("  Completion tokens: {:?}", usage.completion_tokens);
                    println!("  Total tokens: {:?}", usage.total_tokens);
                }
            }
            Err(e) => {
                println!("\n=== API Error ===");
                println!("Error: {}", e);
                panic!("API call failed: {}", e);
            }
        }
    }
}