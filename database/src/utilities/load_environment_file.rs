// USAGE:
// cargo test load_environment_file -- --nocapture
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
            // Default to .env in the backend/ directory
            get_project_path()?.join("backend").join(".env")
        }
    };

    dotenv::from_filename(&path)
        .map(|_| ()) // Convert Result<PathBuf, Error> to Result<(), Error>
        .map_err(|e| {
            format!(
                "Failed to load environment file from {}: {}",
                path.display(),
                e
            )
            .into()
        })
}

/// Gets an environment variable by name.
/// Returns an error if the variable is not found.
pub fn get_environment_variable(environment_variable_name: &str) -> Result<String, Box<dyn Error>> {
    std::env::var(environment_variable_name).map_err(|e| {
        format!(
            "Environment variable '{}' not found: {}",
            environment_variable_name, e
        )
        .into()
    })
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
        let env_file = project_path.join("backend").join(".env");

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

    #[test]
    fn test_get_environment_variable() {
        // Load .env file from default location (repo base)
        println!("Loading .env file from default location...");
        load_environment_file(None).expect("Should load .env file");

        // Get and print XAI_API_KEY
        match get_environment_variable("XAI_API_KEY") {
            Ok(val) => {
                println!("✓ Successfully retrieved XAI_API_KEY = {}", val);
            }
            Err(e) => {
                println!("✗ Failed to get XAI_API_KEY: {}", e);
            }
        }

        // Also test with a manually set variable
        std::env::set_var("TEST_VAR", "test_value_123");

        match get_environment_variable("TEST_VAR") {
            Ok(val) => {
                println!("✓ Successfully retrieved TEST_VAR = {}", val);
                assert_eq!(val, "test_value_123");
            }
            Err(e) => {
                println!("✗ Failed to get TEST_VAR: {}", e);
                panic!("Should have found TEST_VAR");
            }
        }

        // Test with non-existent variable
        match get_environment_variable("NON_EXISTENT_VAR") {
            Ok(_) => panic!("Should have returned an error"),
            Err(e) => println!(
                "✓ Correctly returned error for non-existent variable: {}",
                e
            ),
        }

        // Clean up
        std::env::remove_var("TEST_VAR");
    }
}
