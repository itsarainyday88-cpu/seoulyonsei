export const memoryToolDefinitions = [
    {
        functionDeclarations: [
            // Memory Tools
            {
                name: "read_memory",
                description: "Retrieves strategic information or facts from long-term memory. Use this to recall competitor info, hospital strengths, or past decisions.",
            },
            {
                name: "set_memory",
                description: "Saves a strategic decision or key information to long-term memory. Use this to remember important context for future conversations.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        key: {
                            type: "STRING",
                            description: "The category or key for the memory (e.g., 'competitor_A_analysis', 'blog_strategy_2024')."
                        },
                        value: {
                            type: "STRING",
                            description: "The detailed information to save."
                        }
                    },
                    required: ["key", "value"]
                }
            },
            {
                name: "add_fact",
                description: "Saves a specific fact or detail to memory. Useful for small bits of info like 'Main competitor is Smile Dental' or 'Target audience is 30s women'.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        key: {
                            type: "STRING",
                            description: "The identifier for the fact."
                        },
                        value: {
                            type: "STRING",
                            description: "The fact content."
                        },
                        isPermanent: {
                            type: "BOOLEAN",
                            description: "Set to true if this fact should never be deleted by cleanup processes."
                        }
                    },
                    required: ["key", "value"]
                }
            }
        ]
    }
];

export const thinkingToolDefinitions = [
    {
        functionDeclarations: [
            // Thinking Tools
            {
                name: "init_thinking",
                description: "Initializes a new thinking session for a complex task. Call this when starting a multi-step analysis or planning task.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        goal: {
                            type: "STRING",
                            description: "The goal of this thinking session (e.g., 'Analyze competitor pricing strategy')."
                        }
                    },
                    required: ["goal"]
                }
            },
            {
                name: "add_thought_step",
                description: "Records a step in the thinking process. Call this repeatedly to build a chain of thought.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        content: {
                            type: "STRING",
                            description: "The thought content."
                        },
                        type: {
                            type: "STRING",
                            description: "Type of thought: 'plan', 'execution', 'observation', or 'criticism'.",
                            enum: ["plan", "execution", "observation", "criticism"]
                        }
                    },
                    required: ["content"]
                }
            },
            {
                name: "reflect_thinking",
                description: "Reviews the current thinking session history to find gaps or verify logic. Call this before making a final conclusion on a complex task.",
                parameters: {} /* No parameters needed */
            }
        ]
    }
];

export const toolDefinitions = [
    {
        functionDeclarations: [
            ...memoryToolDefinitions[0].functionDeclarations,
            ...thinkingToolDefinitions[0].functionDeclarations
        ]
    }
];

// --- Phase 2: Deep Research Tools (Marketer Only) ---
export const searchToolDefinitions = [
    {
        functionDeclarations: [
            {
                name: "search_local_trends",
                description: "Searches for recent blog posts from local Korean academies (학원) to identify marketing trends and competitor content. Use this when the user asks about trends, competitor research, or blog topic suggestions WITHOUT providing a URL. Always call this first before scrape_website.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        query: {
                            type: "STRING",
                            description: "The Korean search query to find competitor blogs (e.g., '김포 운양동 수학학원 블로그 최신글', '김포 영어학원 겨울특강')."
                        },
                        max_results: {
                            type: "INTEGER",
                            description: "Number of results to return. Default is 5."
                        },
                        days: {
                            type: "INTEGER",
                            description: "Only return content published within this many days. Default is 180 (6 months). Use 30 for very recent content, 365 for broader coverage."
                        }
                    },
                    required: ["query"]
                }
            },
            {
                name: "scrape_website",
                description: "Reads and extracts the full text content from a specific URL (blog post, webpage). Use this AFTER search_local_trends returns URLs to deeply analyze competitor content. Can also be used when the user provides a specific URL directly.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        url: {
                            type: "STRING",
                            description: "The exact URL of the webpage or blog post to read (e.g., 'https://blog.naver.com/academy_name/post_id')."
                        }
                    },
                    required: ["url"]
                }
            }
        ]
    }
];
