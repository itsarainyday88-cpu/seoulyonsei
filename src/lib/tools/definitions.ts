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
                    type: "object",
                    properties: {
                        key: {
                            type: "string",
                            description: "The category or key for the memory (e.g., 'competitor_A_analysis', 'blog_strategy_2024')."
                        },
                        value: {
                            type: "string",
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
                    type: "object",
                    properties: {
                        key: {
                            type: "string",
                            description: "The identifier for the fact."
                        },
                        value: {
                            type: "string",
                            description: "The fact content."
                        },
                        isPermanent: {
                            type: "boolean",
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
                    type: "object",
                    properties: {
                        goal: {
                            type: "string",
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
                    type: "object",
                    properties: {
                        content: {
                            type: "string",
                            description: "The thought content."
                        },
                        type: {
                            type: "string",
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
                description: "Searches for recent blog posts from local Korean academies (학원) to identify marketing trends and competitor content. Always call this first before scrape_website. You MUST try to exclude your own academy blog if discovered.",
                parameters: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "The Korean search query (e.g., '김포 운양동 수학학원 블로그 최신글')."
                        },
                        max_results: {
                            type: "number",
                            description: "Number of results to return. Default is 5."
                        },
                        days: {
                            type: "number",
                            description: "Only return content published within this many days. Default is 180 (6 months)."
                        },
                        exclude_domains: {
                            type: "array",
                            items: { type: "string" },
                            description: "Domains to exclude (e.g., ['blog.naver.com/itsarainyday88']). Use this to avoid scraping your own content."
                        }
                    },
                    required: ["query"]
                }
            },
            {
                name: "scrape_website",
                description: "Reads and extracts the full text content from a specific URL. Use this AFTER search_local_trends returns URLs to deeply analyze content.",
                parameters: {
                    type: "object",
                    properties: {
                        url: {
                            type: "string",
                            description: "The exact URL of the webpage or blog post to read."
                        }
                    },
                    required: ["url"]
                }
            }
        ]
    }
];
