# Adhere strictly to these codebase structure rules:
    1. STRUCTURE: Split code logically and never write godfiles.
    2. MODULARITY: Enforce the Single Responsibility Principle. Extract types, constants, and helper functions into separate files.
    3. Always create tests for new features and run tests after u done some tasks.
    
# Code Documentation Protocol
    All code must be commented inline. Comments explain the *what* and *why*, not the obvious.
    
    Required
    - Every function needs a description with its parameters and return values.
    - Complex logic, business rules, and edge cases must be explained.
    - Comment every 3-5 lines in dense or non-obvious sections.
    
    Avoid
    - Commenting self-evident code (i++ doesn't need a comment).
    - Comments that just restate what the code literally does.
    - Using comments to excuse bad code — refactor instead.
        