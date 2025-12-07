use std::error::Error;
use std::path::{Path, PathBuf};

/// Gets the project repository base directory by walking up from the current file's location
/// until it finds a .git directory.
/// Returns the absolute path to the repo base.
pub fn get_project_path() -> Result<PathBuf, Box<dyn Error>> {
    // Get the current file's absolute path (equivalent to Path(__file__).resolve() in Python)
    let current_filepath = Path::new(file!())
        .canonicalize()
        .map_err(|e| format!("Failed to canonicalize current file path: {}", e))?;

    // Traverse up directories to find one containing .git
    for parent in current_filepath.ancestors() {
        // Check if '.git' is in this directory
        let git_dir = parent.join(".git");
        if git_dir.exists() {
            return Ok(parent.to_path_buf());
        }
    }

    // If we've exhausted all ancestors without finding .git, raise an error
    Err(format!(
        "Repository main directory not found or .git wasn't found. Started from: {}",
        current_filepath.display()
    ).into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_project_path() {
        let result = get_project_path();
        assert!(result.is_ok(), "Should find the project repository directory");
        
        let path = result.unwrap();
        
        // Print the absolute path
        let canonical_path = path.canonicalize().unwrap_or_else(|_| path.clone());
        println!("Project repository path: {}", canonical_path.display());
        
        // Verify it's a directory
        assert!(path.is_dir(), "Path should be a directory");
        
        // Verify .git exists in that directory
        let git_dir = path.join(".git");
        assert!(git_dir.exists(), "Should find .git directory in repo base");
    }
}