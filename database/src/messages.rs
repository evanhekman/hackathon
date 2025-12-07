use serde::{Deserialize, Serialize};
use serde_json;

/// Message role types for XAI API
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    System,
    User,
    Assistant,
}

/// A message in the chat completion request
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Message {
    pub role: MessageRole,
    pub content: String,
}

impl Message {
    /// Create a new message
    pub fn new(role: MessageRole, content: String) -> Self {
        Self { role, content }
    }

    /// Create a system message
    pub fn system(content: String) -> Self {
        Self {
            role: MessageRole::System,
            content,
        }
    }

    /// Create a user message
    pub fn user(content: String) -> Self {
        Self {
            role: MessageRole::User,
            content,
        }
    }

    /// Create an assistant message
    pub fn assistant(content: String) -> Self {
        Self {
            role: MessageRole::Assistant,
            content,
        }
    }

    /// Convert to JSON string (like Python's to_dict() but returns JSON string)
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }

    /// Convert to JSON value (like Python's to_dict())
    pub fn to_dict(&self) -> Result<serde_json::Value, serde_json::Error> {
        serde_json::to_value(self)
    }
}

/// Reasoning effort level for thinking mode
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ReasoningEffort {
    Low,
    High,
}

/// Reasoning configuration for thinking mode
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ReasoningConfig {
    pub effort: ReasoningEffort,
}

/// Chat completion request for XAI API
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ChatCompletionRequest {
    pub messages: Vec<Message>,
    pub model: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning: Option<ReasoningConfig>,
}

impl ChatCompletionRequest {
    /// Create a new chat completion request
    pub fn new(messages: Vec<Message>, model: String) -> Self {
        Self {
            messages,
            model,
            stream: None,
            reasoning: None,
        }
    }

    /// Create a new request with streaming option
    pub fn with_stream(messages: Vec<Message>, model: String, stream: bool) -> Self {
        Self {
            messages,
            model,
            stream: Some(stream),
            reasoning: None,
        }
    }

    /// Create a new request with streaming and reasoning (thinking mode)
    pub fn with_reasoning(messages: Vec<Message>, model: String, stream: bool, effort: ReasoningEffort) -> Self {
        Self {
            messages,
            model,
            stream: Some(stream),
            reasoning: Some(ReasoningConfig { effort }),
        }
    }

    /// Convert to JSON string (for use in curl -d flag)
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }

    /// Convert to pretty JSON string (for debugging/display)
    pub fn to_json_pretty(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(self)
    }

    /// Convert to JSON value (like Python's to_dict())
    pub fn to_dict(&self) -> Result<serde_json::Value, serde_json::Error> {
        serde_json::to_value(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_system_message_to_json() {
        let message = Message::system("You are Grok, a highly intelligent, helpful AI assistant.".to_string());
        
        let json = message.to_json().expect("Should serialize to JSON");
        println!("System message JSON: {}", json);
        
        // Print what it would look like in curl
        println!("\n=== System Message in curl -d flag ===");
        println!("{}", json);
        
        // Verify it can be deserialized
        let deserialized: Message = serde_json::from_str(&json).expect("Should deserialize");
        assert_eq!(deserialized.role, MessageRole::System);
        assert_eq!(deserialized.content, "You are Grok, a highly intelligent, helpful AI assistant.");
    }

    #[test]
    fn test_user_message_to_json() {
        let message = Message::user("What is the meaning of life, the universe, and everything?".to_string());
        
        let json = message.to_json().expect("Should serialize to JSON");
        println!("User message JSON: {}", json);
        
        // Print what it would look like in curl
        println!("\n=== User Message in curl -d flag ===");
        println!("{}", json);
        
        // Verify it can be deserialized
        let deserialized: Message = serde_json::from_str(&json).expect("Should deserialize");
        assert_eq!(deserialized.role, MessageRole::User);
        assert_eq!(deserialized.content, "What is the meaning of life, the universe, and everything?");
    }

    #[test]
    fn test_chat_completion_request_to_json() {
        let messages = vec![
            Message::system("You are Grok, a highly intelligent, helpful AI assistant.".to_string()),
            Message::user("What is the meaning of life, the universe, and everything?".to_string()),
        ];
        
        let request = ChatCompletionRequest::new(messages, "grok-4".to_string());
        
        let json = request.to_json().expect("Should serialize to JSON");
        println!("Chat completion request JSON: {}", json);
        
        // Print what it would look like in curl -d flag
        println!("\n=== Full curl -d flag content ===");
        println!("{}", json);
        
        // Print as it would appear in a curl command
        println!("\n=== Example curl command ===");
        println!("curl https://api.x.ai/v1/chat/completions \\");
        println!("  -H \"Content-Type: application/json\" \\");
        println!("  -H \"Authorization: Bearer $XAI_API_KEY\" \\");
        println!("  -m 3600 \\");
        println!("  -d '{}'", json);
    }

    #[test]
    fn test_chat_completion_request_with_stream_to_json() {
        let messages = vec![
            Message::system("You are a helpful assistant.".to_string()),
            Message::user("Hello, how are you?".to_string()),
        ];
        
        let request = ChatCompletionRequest::with_stream(messages, "grok-4".to_string(), false);
        
        let json = request.to_json().expect("Should serialize to JSON");
        println!("Chat completion request with stream=false JSON: {}", json);
        
        // Print what it would look like in curl -d flag
        println!("\n=== Full curl -d flag content (with stream=false) ===");
        println!("{}", json);
        
        // Verify stream is included
        let value: serde_json::Value = serde_json::from_str(&json).expect("Should parse JSON");
        assert_eq!(value["stream"], serde_json::json!(false));
    }
}