import path from 'path'; // at the top of index.ts
import express, { Request, Response, NextFunction, RequestHandler, RequestParamHandler } from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import dotenv from 'dotenv';
import * as sql from 'mssql';
import { ParamsDictionary } from 'express-serve-static-core';

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
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

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use(express.static(path.join(__dirname, '../')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'));
});

// Database configuration
const dbConfig: sql.config = {
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
let pool: sql.ConnectionPool;

// Initialize database connection pool
async function initializeDbPool() {
  try {
    pool = await new sql.ConnectionPool(dbConfig).connect();
    console.log('Database connection pool initialized');
  } catch (error) {
    console.error('Failed to initialize database connection pool:', error);
    process.exit(1);
  }
}

// Enhanced asyncHandler with proper typing
const asyncHandler = <P = ParamsDictionary, ResBody = any, ReqBody = any, ReqQuery = any>(
  fn: RequestHandler<P, ResBody, ReqBody, ReqQuery>
): RequestHandler<P, ResBody, ReqBody, ReqQuery> => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Validation middleware with explicit typing
const validateTodoInput: RequestHandler<ParamsDictionary, any, { title: string }> = (req, res, next) => {
  if (!req.body.title || typeof req.body.title !== 'string') {
    res.status(400).json({ 
      error: 'Validation failed',
      details: 'Title is required and must be a string'
    });
    return;
  }
  next();
};

const validateListInput: RequestHandler<ParamsDictionary, any, { name: string }> = (req, res, next) => {
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
const validateListExists: RequestHandler<ParamsDictionary, any, { listId?: number }> = async (req, res, next) => {
  if (req.body.listId) {
    try {
      const listCheck = await pool.request()
        .input('listId', sql.Int, req.body.listId)
        .query('SELECT 1 FROM TodoLists WHERE ListId = @listId');
      
      if (!listCheck.recordset.length) {
        res.status(400).json({ error: 'Invalid List ID' });
        return;
      }
    } catch (error) {
      next(error);
      return;
    }
  }
  next();
};

// API Routes
app.get('/api/test-connection', asyncHandler(async (req, res) => {
  const request = pool.request();
  await request.query('SELECT 1 as test');
  res.json({ success: true, message: 'Database connection successful!' });
}));

// Todo routes
interface TodoQueryParams {
  page?: string;
  limit?: string;
}

app.get('/api/todos', asyncHandler<ParamsDictionary, any, any, TodoQueryParams>(async (req, res) => {
  const { page = '1', limit = '10' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  
  const result = await pool.request()
    .input('offset', sql.Int, offset)
    .input('limit', sql.Int, parseInt(limit))
    .query(`
      SELECT * FROM TodoItems 
      ORDER BY CreatedDate DESC
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `);
  
  res.json(result.recordset);
}));

interface CreateTodoRequestBody {
  title: string;
  description?: string;
  priority?: number;
  dueDate?: string;
  listId?: number;
}

app.post(
  '/api/todos',
  validateTodoInput,
  validateListExists,
  asyncHandler<ParamsDictionary, any, CreateTodoRequestBody>(async (req, res) => {
    const { title, description, priority, dueDate, listId } = req.body;
    
    const result = await pool.request()
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
  })
);

interface UpdateTodoRequestBody {
  title?: string;
  description?: string;
  priority?: number;
  dueDate?: string;
  isCompleted?: boolean;
  listId?: number;
}

app.put(
  '/api/todos/:id',
  validateListExists,
  asyncHandler<{ id: string }, any, UpdateTodoRequestBody>(async (req, res) => {
    const { id } = req.params;
    const { title, description, priority, dueDate, isCompleted, listId } = req.body;
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('title', sql.NVarChar, title || null)
      .input('description', sql.NVarChar, description || null)
      .input('priority', sql.Int, priority || null)
      .input('dueDate', sql.DateTime, dueDate || null)
      .input('isCompleted', sql.Bit, isCompleted ?? null)
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
  })
);

app.delete(
  '/api/todos/:id',
  asyncHandler<{ id: string }>(async (req, res) => {
    const { id } = req.params;
    
    const result = await pool.request()
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
  })
);

// List routes
interface CreateListRequestBody {
  name: string;
  description?: string;
  userId?: number;
}

app.get(
  '/api/lists',
  asyncHandler<ParamsDictionary, any, any, TodoQueryParams>(async (req, res) => {
    const { page = '1', limit = '10' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    const result = await pool.request()
      .input('offset', sql.Int, offset)
      .input('limit', sql.Int, parseInt(limit))
      .query(`
        SELECT * FROM TodoLists 
        ORDER BY CreatedDate DESC
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY
      `);
    
    res.json(result.recordset);
  })
);

app.post(
  '/api/lists',
  validateListInput,
  asyncHandler<ParamsDictionary, any, CreateListRequestBody>(async (req, res) => {
    const { name, description, userId } = req.body;
    
    const result = await pool.request()
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || null)
      .input('userId', sql.Int, userId || null)
      .query(`
        INSERT INTO TodoLists (Name, Description, UserId) 
        OUTPUT INSERTED.*
        VALUES (@name, @description, @userId)
      `);
    
    res.status(201).json(result.recordset[0]);
  })
);

app.put(
  '/api/lists/:id',
  validateListInput,
  asyncHandler<{ id: string }, any, CreateListRequestBody>(async (req, res) => {
    const { id } = req.params;
    const { name, description, userId } = req.body;

    const result = await pool.request()
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
  })
);

app.delete(
  '/api/lists/:id',
  asyncHandler<{ id: string }>(async (req, res) => {
    const { id } = req.params;
    
    const result = await pool.request()
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
  })
);

app.get(
  '/api/lists/:id/todos',
  asyncHandler<{ id: string }>(async (req, res) => {
    const { id } = req.params;
    const result = await pool.request()
      .input('listId', sql.Int, id)
      .query('SELECT * FROM TodoItems WHERE ListId = @listId ORDER BY CreatedDate DESC');
    res.json(result.recordset);
  })
);

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
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
process.on('SIGINT', async () => {
  if (pool) {
    try {
      await pool.close();
      console.log('Database connection pool closed');
    } catch (err) {
      console.error('Error closing database connection pool:', err);
    }
  }
  process.exit(0);
});