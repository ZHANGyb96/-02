# AlphaScan AI (端云协同版)

AlphaScan AI 是一款专为个人投资者、量化研究员和小型工作室打造的专业级股票/期货量化分析与回测软件。

本项目已全面重构为**“端云协同 (Edge-Cloud Collaboration)”**架构，采用**“胖客户端计算 + 瘦云端授权”**的模式。将核心的数据下载、存储与策略回测全部下放至用户本地设备，为您提供**绝对的策略隐私**和**无上限的本地计算性能**。

---

## 🌟 核心商业优势

- 🛡️ **绝对的策略隐私**：用户的自选股、回测条件和交易策略**绝不上传云端**，全部在本地内存中完成计算，彻底消除量化交易者的安全顾虑。
- 🚀 **算力性能无上限**：抛弃拥挤的云端排队！回测速度直接取决于用户电脑的 CPU 性能。使用本地纯血向量化算法与 DuckDB，百万级 K 线跨周期回测仅需数秒。
- 💰 **极低的云端运营成本**：云端不再需要存储海量金融数据，也不需要昂贵的高算力集群。一台几百元的轻量级云服务器即可支撑上万用户的授权与管控。
- ⚖️ **规避数据版权合规风险**：系统不在云端集中分发金融数据，而是由客户端直接向第三方接口（如新浪、AkShare）发起本地拉取，规避了数据转售的法律红线。

---

## 🏗️ 系统架构图

系统在逻辑上严格分为“客户端”与“云端”两部分：

```text
 ┌────────────────────────────────────────────────────────┐
 │                   云端控制中心 (Cloud)                   │
 │  (目录: /nodejs_api)                                    │
 │  - PostgreSQL/MySQL: 集中存储用户账号与 License 激活记录     │
 │  - Node.js API: 处理登录、发码、鉴权、防多端多开             │
 └──────────┬─────────────────────────────────────────────┘
            │ (轻量级通信，仅校验 JWT 权限证书，不传业务数据)
 ┌──────────▼─────────────────────────────────────────────┐
 │                 用户本地设备 (PC / Mobile)               │
 │  (目录: /, /python_engine)                             │
 │  - 前端交互层: Next.js (未来可打包为 Electron/Tauri)       │
 │  - 本地持久层: DuckDB (存海量 K 线), SQLite (存回测历史)     │
 │  - 本地计算层: Python 引擎 (高速 pandas 向量化计算)        │
 └────────────────────────────────────┬───────────────────┘
                                      │ (客户端公网直连)
                           ┌──────────▼───────────┐
                           │   第三方公开数据源     │
                           └──────────────────────┘
🛠️ 技术栈
客户端 (Fat Client)：
UI 呈现：Next.js 14+ Tailwind CSS + Sh
本地数据仓库：DuckDB (极速列式存储，专为金融时序数据优化)
本地回测引擎：Python 3 + Pandas (深度定制的向量化 TA-Math 算法)
本地配置库：SQLite (存储用户的回测历史与策略模板)
云端 (Thin Cloud)：
核心网关：Node.js（Express） + JWT (RS256 非对称加密授权)
集中数据库：PostgreSQL (或 MySQL)
🚀 快速启动 (本地开发模式)
在日常开发中，我们将在同一台机器上同时运行“云端服务”和“客户端服务”以进行联调。全过程无需 Docker，开箱即用。
1. 环境准备
已安装 Node.js（18岁以上）
已安装Python（v3.8+）管道
2. 环境变量配置
请确保项目中存在以下配置文件：
a) 前端客户端 (项目根目录 .env.local）：
code
环境
NEXT_PUBLIC_API_URL=http://localhost:3001
b) 云端管控中心 (nodejs_api/.env）：
code
环境
PORT=3001
DB_MODE=local  # 开发期使用 SQLite 模拟云端 DB，生产环境请改为 cloud 并配置 PostgreSQL
# (首次运行前，请先执行 node keygen.js 生成公私钥，并将公钥填入下方的 APP_PUBLIC_KEY)
APP_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
JWT_SECRET=your_super_secret_dev_key
c) 客户端计算引擎 (python_engine/.env）：
code
环境
RUN_MODE=local
DUCKDB_PATH=../local_data/alphascan.duckdb
3. 安装依赖与启动服务
建议打开 三个独立的终端窗口 分别运行以下服务：
终端 1：启动客户端 Python 计算引擎 (数据获取与回测处理)
这是客户端的心脏，首次运行会自动创建 本地数据 目录及 DuckDB 本地数据库文件。
code
巴什
cd python_engine
pip install -r requirements.txt
python main.py
(注：开发期可让其常驻，生产环境中 Python 将由 Node/Electron 直接通过子进程调用)
终端 2：启动云端管控 API (负责登录与授权校验)
code
巴什
cd nodejs_api
npm install
npm run dev
终端 3：启动客户端 UI (可视化的量化工作台)
code
巴什
# 在项目根目录
npm install
npm run dev
4. 访问应用
打开浏览器访问 http://localhost:9002。
💡 提示：你可以通过 nodejs_api 目录下的 keygen.js 脚本生成具有指定有效期的离线激活码，并在系统页面的“软件激活”中测试商业授权流程。
📦 生产发布指南 (Deployment)
作为端云协同架构，生产发布分为两步：
云端部署 (Vercel / VPS)
将 nodejs_api 目录独立部署到任意 Node.js 环境（如 AWS、阿里云或 Vercel）。
挂载云端 PostgreSQL 数据库。
客户端打包 (Electron / Tauri 方案)
使用 Next.js 的 下一个版本 导出纯静态的前端资源 (出去 目录)。
使用PyInstaller将python_engine 打包为免安装的跨平台可执行文件 (。EXE文件/。应用程序）。
使用 Electron 或 Tauri 将前端页面、Node.js 本地代理层和 Python 可执行文件统装为一个桌面桌面安装包，分发给最终用户。
© 2026 AlphaScan AI。版权所有。