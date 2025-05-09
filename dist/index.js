"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const swagger_jsdoc_1 = __importDefault(require("swagger-jsdoc"));
const dotenv_1 = __importDefault(require("dotenv"));
const sql = __importStar(require("mssql"));
// Load environment variables
dotenv_1.default.config();
// Create Express app
const app = (0, express_1.default)();
const port = process.env.PORT || 3001;
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Todo API',
            version: '1.0.0',
            description: 'API for managing todo items and lists',
        },
        servers: [
            {
                url: process.env.SWAGGER_BASE_URL || '',
                description: 'Deployed server'
            },
        ],
        components: {
            schemas: {
                TodoItem: {
                    type: 'object',
                    properties: {
                        Id: { type: 'integer' },
                        Title: { type: 'string' },
                        Description: { type: 'string' },
                        IsCompleted: { type: 'boolean' },
                        Priority: { type: 'integer' },
                        DueDate: { type: 'string', format: 'date-time' },
                        CreatedDate: { type: 'string', format: 'date-time' },
                        ListId: { type: 'integer' }
                    }
                },
                TodoList: {
                    type: 'object',
                    properties: {
                        ListId: { type: 'integer' },
                        Name: { type: 'string' },
                        Description: { type: 'string' },
                        CreatedDate: { type: 'string', format: 'date-time' },
                        UserId: { type: 'integer' }
                    }
                },
                ErrorResponse: {
                    type: 'object',
                    properties: {
                        error: { type: 'string' },
                        details: { type: 'string' }
                    }
                }
            }
        }
    },
    apis: ['./src/index.ts'],
};
const swaggerSpec = (0, swagger_jsdoc_1.default)(swaggerOptions);
// Middleware
app.use((0, cors_1.default)({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express_1.default.json());
app.use('/api-docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swaggerSpec));
// Database configuration
const dbConfig = {
    server: process.env.DB_SERVER || '',
    database: process.env.DB_NAME || '',
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    options: {
        encrypt: true,
        trustServerCertificate: false
    }
};
// Create a single connection pool to be reused
let pool;
// Initialize database connection pool
function initializeDbPool() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            pool = yield new sql.ConnectionPool(dbConfig).connect();
            console.log('Database connection pool initialized');
        }
        catch (error) {
            console.error('Failed to initialize database connection pool:', error);
            process.exit(1);
        }
    });
}
// Enhanced asyncHandler with proper typing
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
// Validation middleware with explicit typing
const validateTodoInput = (req, res, next) => {
    if (!req.body.title || typeof req.body.title !== 'string') {
        res.status(400).json({
            error: 'Validation failed',
            details: 'Title is required and must be a string'
        });
        return;
    }
    next();
};
const validateListInput = (req, res, next) => {
    if (!req.body.name || typeof req.body.name !== 'string') {
        res.status(400).json({
            error: 'Validation failed',
            details: 'List name is required and must be a string'
        });
        return;
    }
    next();
};
// List existence validation with proper typing
const validateListExists = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    if (req.body.listId) {
        try {
            const listCheck = yield pool.request()
                .input('listId', sql.Int, req.body.listId)
                .query('SELECT 1 FROM TodoLists WHERE ListId = @listId');
            if (!listCheck.recordset.length) {
                res.status(400).json({ error: 'Invalid List ID' });
                return;
            }
        }
        catch (error) {
            next(error);
            return;
        }
    }
    next();
});
// API Routes
app.get('/api/test-connection', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const request = pool.request();
    yield request.query('SELECT 1 as test');
    res.json({ success: true, message: 'Database connection successful!' });
})));
app.get('/api/todos', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { page = '1', limit = '10' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const result = yield pool.request()
        .input('offset', sql.Int, offset)
        .input('limit', sql.Int, parseInt(limit))
        .query(`
      SELECT * FROM TodoItems 
      ORDER BY CreatedDate DESC
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `);
    res.json(result.recordset);
})));
app.post('/api/todos', validateTodoInput, validateListExists, asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { title, description, priority, dueDate, listId } = req.body;
    const result = yield pool.request()
        .input('title', sql.NVarChar, title)
        .input('description', sql.NVarChar, description || null)
        .input('priority', sql.Int, priority || 0)
        .input('dueDate', sql.DateTime, dueDate || null)
        .input('listId', sql.Int, listId || null)
        .query(`
        INSERT INTO TodoItems (Title, Description, Priority, DueDate, ListId) 
        OUTPUT INSERTED.*
        VALUES (@title, @description, @priority, @dueDate, @listId)
      `);
    res.status(201).json(result.recordset[0]);
})));
app.put('/api/todos/:id', validateListExists, asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const { title, description, priority, dueDate, isCompleted, listId } = req.body;
    const result = yield pool.request()
        .input('id', sql.Int, id)
        .input('title', sql.NVarChar, title || null)
        .input('description', sql.NVarChar, description || null)
        .input('priority', sql.Int, priority || null)
        .input('dueDate', sql.DateTime, dueDate || null)
        .input('isCompleted', sql.Bit, isCompleted !== null && isCompleted !== void 0 ? isCompleted : null)
        .input('listId', sql.Int, listId || null)
        .query(`
        UPDATE TodoItems 
        SET 
          Title = ISNULL(@title, Title),
          Description = ISNULL(@description, Description),
          Priority = ISNULL(@priority, Priority),
          DueDate = ISNULL(@dueDate, DueDate),
          IsCompleted = ISNULL(@isCompleted, IsCompleted),
          ListId = ISNULL(@listId, ListId)
        OUTPUT INSERTED.*
        WHERE Id = @id
      `);
    if (result.recordset.length === 0) {
        res.status(404).json({ error: 'Todo not found' });
        return;
    }
    res.json(result.recordset[0]);
})));
app.delete('/api/todos/:id', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const result = yield pool.request()
        .input('id', sql.Int, id)
        .query('DELETE FROM TodoItems OUTPUT DELETED.* WHERE Id = @id');
    if (result.recordset.length === 0) {
        res.status(404).json({ error: 'Todo not found' });
        return;
    }
    res.json({
        success: true,
        deletedItem: result.recordset[0]
    });
})));
app.get('/api/lists', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { page = '1', limit = '10' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const result = yield pool.request()
        .input('offset', sql.Int, offset)
        .input('limit', sql.Int, parseInt(limit))
        .query(`
        SELECT * FROM TodoLists 
        ORDER BY CreatedDate DESC
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY
      `);
    res.json(result.recordset);
})));
app.post('/api/lists', validateListInput, asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { name, description, userId } = req.body;
    const result = yield pool.request()
        .input('name', sql.NVarChar, name)
        .input('description', sql.NVarChar, description || null)
        .input('userId', sql.Int, userId || null)
        .query(`
        INSERT INTO TodoLists (Name, Description, UserId) 
        OUTPUT INSERTED.*
        VALUES (@name, @description, @userId)
      `);
    res.status(201).json(result.recordset[0]);
})));
app.put('/api/lists/:id', validateListInput, asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const { name, description, userId } = req.body;
    const result = yield pool.request()
        .input('id', sql.Int, id)
        .input('name', sql.NVarChar, name)
        .input('description', sql.NVarChar, description || null)
        .input('userId', sql.Int, userId || null)
        .query(`
        UPDATE TodoLists 
        SET 
          Name = @name,
          Description = @description,
          UserId = @userId
        OUTPUT INSERTED.*
        WHERE ListId = @id
      `);
    if (result.recordset.length === 0) {
        res.status(404).json({ error: 'List not found' });
        return;
    }
    res.json(result.recordset[0]);
})));
app.delete('/api/lists/:id', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const result = yield pool.request()
        .input('id', sql.Int, id)
        .query('DELETE FROM TodoLists OUTPUT DELETED.* WHERE ListId = @id');
    if (result.recordset.length === 0) {
        res.status(404).json({ error: 'List not found' });
        return;
    }
    res.json({
        success: true,
        deletedList: result.recordset[0]
    });
})));
app.get('/api/lists/:id/todos', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const result = yield pool.request()
        .input('listId', sql.Int, id)
        .query('SELECT * FROM TodoItems WHERE ListId = @listId ORDER BY CreatedDate DESC');
    res.json(result.recordset);
})));
// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});
// Initialize the database pool before starting the server
initializeDbPool().then(() => {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}).catch(err => {
    console.error('Failed to start server:', err);
});
// Handle application shutdown
process.on('SIGINT', () => __awaiter(void 0, void 0, void 0, function* () {
    if (pool) {
        try {
            yield pool.close();
            console.log('Database connection pool closed');
        }
        catch (err) {
            console.error('Error closing database connection pool:', err);
        }
    }
    process.exit(0);
}));
//# sourceMappingURL=index.js.map