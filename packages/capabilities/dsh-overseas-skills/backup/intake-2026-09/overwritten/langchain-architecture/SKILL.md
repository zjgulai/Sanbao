---
name: "langchain-architecture"
title: "LangChain 架构设计"
description: "用 LangChain 与 LangGraph 设计 LLM 应用：状态图、记忆、工具集成与测试策略。触发词：LangChain、LangGraph、AI agent、LLM 工作流、对话记忆、工具调用、langchain-architecture。何时不用：不用 LangChain/LangGraph 的 LLM 应用架构不在本技能范围；它给的是这两个框架的落地范式，不是通用的 agent 设计方法论。"
enabled: "true"
disable-model-invocation: false
user-invocable: true
---
# LangChain 与 LangGraph 架构

掌握现代 LangChain 1.x 与 LangGraph，用于构建带 agent、状态管理、记忆与工具集成的高级 LLM 应用。

## 何时使用本技能

- 构建带工具访问能力的自主 AI agent
- 实现复杂的多步 LLM 工作流
- 管理对话记忆与状态
- 把 LLM 与外部数据源和 API 集成
- 创建模块化、可复用的 LLM 应用组件
- 实现文档处理流水线
- 构建生产级 LLM 应用

## 包结构（LangChain 1.x）

```
langchain (1.2.x)         # High-level orchestration
langchain-core (1.2.x)    # Core abstractions (messages, prompts, tools)
langchain-community       # Third-party integrations
langgraph                 # Agent orchestration and state management
langchain-openai          # OpenAI integrations
langchain-anthropic       # Anthropic/Claude integrations
langchain-voyageai        # Voyage AI embeddings
langchain-pinecone        # Pinecone vector store
```

## 核心概念

### 1. LangGraph Agent

LangGraph 是 2026 年构建 agent 的标准。它提供：

**关键特性：**

- **StateGraph**：带类型化状态的显式状态管理
- **持久化执行**：agent 能挺过故障
- **人在回路**：在任意点检视并修改状态
- **记忆**：跨会话的短期与长期记忆
- **检查点**：保存并恢复 agent 状态

**Agent 模式：**

- **ReAct**：用 `create_react_agent` 做推理 + 行动
- **Plan-and-Execute**：规划节点与执行节点分离
- **多 Agent**：在专职 agent 之间做 supervisor 路由
- **Tool-Calling**：用 Pydantic schema 做结构化工具调用

### 2. 状态管理

LangGraph 用 TypedDict 表达显式状态：

```python
from typing import Annotated, TypedDict
from langgraph.graph import MessagesState

# Simple message-based state
class AgentState(MessagesState):
    """Extends MessagesState with custom fields."""
    context: Annotated[list, "retrieved documents"]

# Custom state for complex agents
class CustomState(TypedDict):
    messages: Annotated[list, "conversation history"]
    context: Annotated[dict, "retrieved context"]
    current_step: str
    results: list
```

### 3. 记忆系统

现代的记忆实现：

- **ConversationBufferMemory**：存下所有消息（短对话）
- **ConversationSummaryMemory**：对较早的消息做摘要（长对话）
- **ConversationTokenBufferMemory**：按 token 数开窗
- **VectorStoreRetrieverMemory**：语义相似度检索
- **LangGraph Checkpointers**：跨会话的持久状态

### 4. 文档处理

加载、转换与存储文档：

**组件：**

- **Document Loaders**：从各种来源加载
- **Text Splitters**：智能切分文档
- **Vector Stores**：存储并检索 embedding
- **Retrievers**：取回相关文档

### 5. 回调与链路追踪

LangSmith 是可观测性的标准：

- 请求/响应日志
- token 用量跟踪
- 延迟监控
- 错误跟踪
- 链路可视化

## 快速上手

### 用 LangGraph 构建现代 ReAct Agent

```python
from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.memory import MemorySaver
from langchain_anthropic import ChatAnthropic
from langchain_core.tools import tool
import ast
import operator

# Initialize LLM (Claude Sonnet 5 recommended)
llm = ChatAnthropic(model="claude-sonnet-5")

# Define tools with Pydantic schemas
@tool
def search_database(query: str) -> str:
    """Search internal database for information."""
    # Your database search logic
    return f"Results for: {query}"

@tool
def calculate(expression: str) -> str:
    """Safely evaluate a mathematical expression.

    Supports: +, -, *, /, **, %, parentheses
    Example: '(2 + 3) * 4' returns '20'
    """
    # Safe math evaluation using ast
    allowed_operators = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
        ast.Pow: operator.pow,
        ast.Mod: operator.mod,
        ast.USub: operator.neg,
    }

    def _eval(node):
        if isinstance(node, ast.Constant):
            return node.value
        elif isinstance(node, ast.BinOp):
            left = _eval(node.left)
            right = _eval(node.right)
            return allowed_operators[type(node.op)](left, right)
        elif isinstance(node, ast.UnaryOp):
            operand = _eval(node.operand)
            return allowed_operators[type(node.op)](operand)
        else:
            raise ValueError(f"Unsupported operation: {type(node)}")

    try:
        tree = ast.parse(expression, mode='eval')
        return str(_eval(tree.body))
    except Exception as e:
        return f"Error: {e}"

tools = [search_database, calculate]

# Create checkpointer for memory persistence
checkpointer = MemorySaver()

# Create ReAct agent
agent = create_react_agent(
    llm,
    tools,
    checkpointer=checkpointer
)

# Run agent with thread ID for memory
config = {"configurable": {"thread_id": "user-123"}}
result = await agent.ainvoke(
    {"messages": [("user", "Search for Python tutorials and calculate 25 * 4")]},
    config=config
)
```

## 详细模式与完整示例

详细的模式文档在 `references/details.md`。当上面这一层导航不够用时，读那个文件。

## 测试策略

```python
import pytest
from unittest.mock import AsyncMock, patch

@pytest.mark.asyncio
async def test_agent_tool_selection():
    """Test agent selects correct tool."""
    with patch.object(llm, 'ainvoke') as mock_llm:
        mock_llm.return_value = AsyncMock(content="Using search_database")

        result = await agent.ainvoke({
            "messages": [("user", "search for documents")]
        })

        # Verify tool was called
        assert "search_database" in str(result)

@pytest.mark.asyncio
async def test_memory_persistence():
    """Test memory persists across invocations."""
    config = {"configurable": {"thread_id": "test-thread"}}

    # First message
    await agent.ainvoke(
        {"messages": [("user", "Remember: the code is 12345")]},
        config
    )

    # Second message should remember
    result = await agent.ainvoke(
        {"messages": [("user", "What was the code?")]},
        config
    )

    assert "12345" in result["messages"][-1].content
```

## 性能优化

### 1. 用 Redis 做缓存

```python
from langchain_community.cache import RedisCache
from langchain_core.globals import set_llm_cache
import redis

redis_client = redis.Redis.from_url("redis://localhost:6379")
set_llm_cache(RedisCache(redis_client))
```

### 2. 异步批处理

```python
import asyncio
from langchain_core.documents import Document

async def process_documents(documents: list[Document]) -> list:
    """Process documents in parallel."""
    tasks = [process_single(doc) for doc in documents]
    return await asyncio.gather(*tasks)

async def process_single(doc: Document) -> dict:
    """Process a single document."""
    chunks = text_splitter.split_documents([doc])
    embeddings = await embeddings_model.aembed_documents(
        [c.page_content for c in chunks]
    )
    return {"doc_id": doc.metadata.get("id"), "embeddings": embeddings}
```

### 3. 连接池

```python
from langchain_pinecone import PineconeVectorStore
from pinecone import Pinecone

# Reuse Pinecone client
pc = Pinecone(api_key=os.environ["PINECONE_API_KEY"])
index = pc.Index("my-index")

# Create vector store with existing index
vectorstore = PineconeVectorStore(index=index, embedding=embeddings)
```
