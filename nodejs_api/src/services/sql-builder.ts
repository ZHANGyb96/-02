
/**
 * @fileoverview 安全的 SQL WHERE 条件构造器，通过字段白名单和参数化防止 SQL 注入。
 */

// 允许在回测条件中使用的字段白名单
const ALLOWED_FIELDS = new Set([
    'open', 'high', 'low', 'close', 'volume',
    // MAs
    'ma5', 'ma10', 'ma20', 'ma60', 'ma120', 'ma250',
    // BBI
    'bbi',
    // MACD
    'macd', 'macd_signal', 'macd_hist',
    // KDJ
    'kdj_k', 'kdj_d', 'kdj_j',
    // RSI
    'rsi_6', 'rsi_12', 'rsi_24',
    // TRIX
    'trix', 'trma',
    // DPO
    'dpo', 'madpo',
    // CCI
    'cci',
    // LON
    'lon', 'lonma',
    // DMI
    'pdi', 'mdi', 'adx', 'adxr',
    // BOLL
    'boll_upper', 'boll_middle', 'boll_lower',
    // BIAS
    'bias_6', 'bias_12', 'bias_24',
    // Volume MAs
    'vol_ma5', 'vol_ma10'
]);

// 允许的比较运算符
const ALLOWED_OPERATORS = new Set(['>', '<', '=', '>=', '<=', '!=', '<>']);

// 单个条件接口
interface Condition {
    left: string;
    op: string;
    right: string | number;
}

// 条件组接口 (用于 AND/OR 逻辑)
interface ConditionGroup {
    logic: 'AND' | 'OR';
    conditions: (Condition | ConditionGroup)[];
}

type WhereClause = Condition | ConditionGroup;

export class SqlBuilder {
    private params: (string | number)[] = [];
    private paramCounter: number = 1; // 用于 PostgreSQL 的 $1, $2 风格参数
    private driver: 'mysql' | 'pg';

    constructor(driver: 'mysql' | 'pg' = 'mysql') {
        this.driver = driver;
    }

    /**
     * 构建 WHERE 子句和参数
     * @param jsonConditions - JSON格式的链式条件
     * @returns 返回一个包含 where 子句字符串和参数数组的对象
     */
    public build(jsonConditions: WhereClause): { where: string, params: (string | number)[] } {
        const whereClause = this.parse(jsonConditions);
        // 如果没有生成任何条件，返回一个恒为真的条件以避免SQL语法错误
        if (!whereClause) {
            return { where: '1=1', params: [] };
        }
        return { where: whereClause, params: this.params };
    }

    /**
     * 递归解析条件树
     * @param condition - 单个条件或条件组
     */
    private parse(condition: WhereClause): string {
        if ('logic' in condition) { // 这是一个条件组 (ConditionGroup)
            const clauses = condition.conditions.map(c => this.parse(c)).filter(c => c);
            return clauses.length > 0 ? `(${clauses.join(` ${condition.logic} `)})` : '';
        } else { // 这是一个单一条件 (Condition)
            return this.buildSingleCondition(condition);
        }
    }

    /**
     * 构建单个条件的 SQL 字符串
     * @param condition - 单个条件对象
     */
    private buildSingleCondition(condition: Condition): string {
        const { left, op, right } = condition;

        // 1. 字段白名单校验
        if (!ALLOWED_FIELDS.has(left)) {
            throw new Error(`[SqlBuilder] 非法字段: ${left}。不允许在查询条件中使用。`);
        }
        // 如果右侧也是一个字段名 (而非数值)，同样需要校验
        if (typeof right === 'string' && isNaN(Number(right)) && !ALLOWED_FIELDS.has(right)) {
             throw new Error(`[SqlBuilder] 非法字段: ${right}。不允许在查询条件中使用。`);
        }

        // 2. 运算符白名单校验
        if (!ALLOWED_OPERATORS.has(op)) {
            throw new Error(`[SqlBuilder] 非法运算符: ${op}。`);
        }

        const placeholder = this.driver === 'mysql' ? '?' : `$${this.paramCounter++}`;

        // 3. 构建参数化查询部分
        if (typeof right === 'string' && isNaN(Number(right))) {
            // 情况 A: 右侧是一个字段名, 例如 'ma5 > ma10'
            return `${left} ${op} ${right}`;
        } else {
            // 情况 B: 右侧是一个具体的值, 例如 'close > 100'
            this.params.push(right);
            return `${left} ${op} ${placeholder}`;
        }
    }
}
