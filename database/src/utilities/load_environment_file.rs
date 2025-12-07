use crate::utilities::get_project_path::get_project_path;
use dotenv;
use std::error::Error;
use std::path::PathBuf;

/// Loads environment variables from a .env file.
/// If no path is provided, defaults to .env in the project repository base directory.
pub fn load_environment_file(env_file_path: Option<PathBuf>) -> Result<(), Box<dyn Error>> {
    let path = match env_file_path {
        Some(p) => p,
        None => {
            // Default to .env in the project repo base
            get_project_path()?.join(".env")
        }
    };
    
    dotenv::from_filename(&path)
        .map(|_| ())  // Convert Result<PathBuf, Error> to Result<(), Error>
        .map_err(|e| format!("Failed to load environment file from {}: {}", path.display(), e).into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utilities::get_project_path::get_project_path;

    #[test]
    fn test_load_environment_file_with_default_path() {
        println!("Testing load_environment_file with default path...");
        
        let result = load_environment_file(None);
        match result {
            Ok(_) => {
                println!("✓ Successfully loaded .env file from repo base");
                
                // Print XAI_API_KEY if it exists
                match std::env::var("XAI_API_KEY") {
                    Ok(val) => println!("XAI_API_KEY = {}", val),
                    Err(_) => println!("XAI_API_KEY not found in environment"),
                }
            }
            Err(e) => {
                println!("✗ Failed to load .env file: {}", e);
            }
        }
    }

    #[test]
    fn test_load_environment_file_with_explicit_path() {
        println!("Testing load_environment_file with explicit path...");
        
        let project_path = get_project_path().expect("Should find project path");
        let env_file = project_path.join(".env");
        
        println!("Attempting to load: {}", env_file.display());
        
        let result = load_environment_file(Some(env_file));
        match result {
            Ok(_) => {
                println!("✓ Successfully loaded .env file");
                
                // Print XAI_API_KEY if it exists
                match std::env::var("XAI_API_KEY") {
                    Ok(val) => println!("XAI_API_KEY = {}", val),
                    Err(_) => println!("XAI_API_KEY not found in environment"),
                }
            }
            Err(e) => {
                println!("✗ Failed to load .env file: {}", e);
            }
        }
    }
}