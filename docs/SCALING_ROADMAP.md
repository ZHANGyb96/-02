# AlphaScan AI: 系统扩容路线图

本文档旨在为 AlphaScan AI 项目提供一个从当前“本地单机测试”环境平滑演进到能够支撑“万人级别高并发回测”的生产级云原生架构的清晰路线图。

## 阶段一：本地开发模式 (两种选择)

为了方便开发与测试，系统支持两种开箱即用的本地运行方式。它们共享完全相同的应用代码，仅在数据存储层有所不同，可通过环境变量轻松切换。

### 选项 A: 本地文件模式 (推荐入门)

这是最快、最简单的入门方式，**无需安装和运行 Docker**。

-   **数据库**:
    -   **分析引擎**: 使用 **DuckDB** 作为文件型数据仓库，数据存储在 `local_data/alphascan.duckdb`。
    -   **用户与任务**: 使用 **SQLite** 作为文件型数据库，数据存储在 `local_data/alphascan_tasks.sqlite`。
-   **应用服务**: 前端 (Next.js), 后端 (Node.js), 数据引擎 (Python) 直接在开发机上运行。
-   **如何启用**: 在 `nodejs_api` 和 `python_engine` 的 `.env` 文件中设置 `DB_MODE=local` 和 `RUN_MODE=local`。
-   **优势**: 零依赖、启动速度快、无网络下载问题，非常适合快速开始功能开发和体验。

### 选项 B: Docker 容器模式 (模拟生产)

此方式通过 Docker 在本地模拟生产环境的数据库组件，更接近云端部署。

-   **数据库**: 通过 `docker-compose.yml` 在本地运行 **PostgreSQL** 和 **Apache Doris** 容器。
-   **应用服务**: 应用服务本身仍然可以直接在开发机上运行，连接到 Docker 中的数据库。
-   **如何启用**: 运行 `docker-compose up -d`，并在 `nodejs_api` 和 `python_engine` 的 `.env` 文件中设置 `DB_MODE=cloud` 和 `RUN_MODE=cloud`（并配置正确的数据库连接字符串）。
-   **挑战**: 可能会遇到下载大型 Docker 镜像时的网络问题（如 `EOF` 错误），这通常是暂时的网络波动导致，需要重试。

**结论**: 推荐从 **选项 A** 开始。当需要进行更接近生产环境的集成测试或准备上云时，再切换到 **选项 B** 或直接进入阶段二。

---

## 阶段二：云端 MVP 部署 (支撑百人级用户)

目标：将系统迁移至云端，实现基本的高可用性与服务解耦。

1.  **数据库无缝切换至云端托管服务**:
    *   **操作**:
        *   在云厂商（如 AWS, GCP, Azure, 阿里云）上购买 RDS for PostgreSQL（或类似高可用 PostgreSQL 服务）和云托管的 Apache Doris 集群（或自建 Doris 集群）。
        *   修改 `nodejs_api` 和 `python_engine` 的环境变量配置文件 (`.env`)，将数据库连接地址、用户名和密码指向云端实例。
        *   在 `nodejs_api` 中设置 `DB_MODE=cloud`。
        *   在 `python_engine` 中设置 `RUN_MODE=cloud`。
    *   **优势**: **零代码修改**。无论您从阶段一的哪个选项开始，由于我们设计了 `DatabaseFactory` 和动态持久化层，应用代码都无需任何改动即可平滑迁移。

2.  **应用容器化与服务编排**:
    *   为 `next-app`, `nodejs_api`, `python_engine` 分别编写 `Dockerfile`。
    *   使用 Kubernetes (或更简单的服务如 Google Cloud Run, AWS App Runner) 来部署和管理这三个服务的容器。
    *   配置 Nginx Ingress Controller (或云厂商的负载均衡器) 并应用我们已编写好的 `nginx.conf` 规则，实现流量分发和 SSL 卸载。

3.  **引入 Redis 作为任务状态缓存**:
    *   在 Node.js 中，将 `ITaskRepository` 的实现从直接读写 PostgreSQL 改为优先读写 Redis 缓存，以加速任务状态的查询，减轻主数据库压力。

**结论**: 此阶段实现了服务的云端化和基本解耦，能够应对少量并发，但回测任务的执行仍是瓶颈。

---

## 阶段三：高并发分布式架构 (支撑万人级并发回测)

目标：引入真正的分布式任务队列，并深度优化数据仓库性能，以应对大规模并发请求。

1.  **任务队列解耦 (核心改造)**:
    *   **问题**: 当前的异步模型在 Node.js 进程内，一个耗时长的回测会拖慢整个服务，且无法横向扩展。
    *   **解决方案**:
        *   引入 **Redis** 或 **RabbitMQ** 作为专业的消息队列（Message Queue）。
        *   改造 `backtest.service.ts`: 当 `/api/v1/backtest/submit` 接口被调用时，不再是本地 `Promise` 执行，而是将任务参数（`taskId`, `stockCode`, `conditions`）作为一个消息**发布**到消息队列的特定主题（如 `backtest_tasks`）。
        *   创建一组独立的 **Python Worker (消费者)** 服务。这些 Worker 监听 `backtest_tasks` 主题，获取任务消息，执行真正的回测计算（之前在 `backtest.service.ts` 中的逻辑），并将结果写回 PostgreSQL/Doris。
    *   **优势**:
        *   **异步解耦**: Node.js API 只负责快速接收请求和返回 `taskId`，响应时间极短。
        *   **弹性伸缩**: 当回测任务积压时，我们只需增加 Python Worker 的容器实例数量即可，实现了计算资源的弹性扩容，与 API 服务无关。
        *   **削峰填谷**: 即使瞬间涌入成千上万个回测请求，也只是在消息队列中排队，不会冲垮系统。

2.  **Apache Doris 性能压榨 (毫秒级响应)**:
    *   **问题**: 随着几年乃至十几年的历史数据载入，`runBacktestQuery` 中的聚合查询会变慢。
    *   **解决方案**:
        *   **优化分桶 (Buckets)**: 根据数据量和查询并发，重新评估并调整 `DISTRIBUTED BY HASH(stock_code) BUCKETS xxx` 中的分桶数，确保数据在 BE 节点上均匀分布，避免数据倾斜。
        *   **建立物化视图 (Materialized View)**: 对于一些常用的、固定的回测场景（例如“金叉后5日胜率”），可以创建异步的物化视图。Doris 会在后台预先计算好这些结果。当查询命中物化视图时，可以直接返回预计算结果，实现毫T秒级响应。
        *   **开启查询缓存 (Result Cache)**: 在 Doris FE 中配置并开启 `query_cache`。对于完全相同的查询 SQL（例如，多个用户在短时间内回测同一个策略），Doris 会直接返回缓存中的结果，避免重复计算。

3.  **前端体验优化**:
    *   将任务状态轮询从 HTTP 短轮询升级为 **WebSocket**。当任务完成时，由后端主动推送消息给前端，降低无效的 API 请求，提升实时性。

**结论**: 通过引入分布式任务队列和深度优化数据仓库，系统架构将能够轻松应对万人级别的并发回测需求，并为未来的功能扩展（如实时策略告警、机器学习模型训练等）打下坚实的基础。
