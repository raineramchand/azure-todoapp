import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import * as sql from 'mssql';

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

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

// Helper function to properly type async route handlers with params
const asyncHandler = <P = {}, ResBody = {}, ReqBody = {}, ReqQuery = {}>(
  fn: (req: Request<P, ResBody, ReqBody, ReqQuery>, res: Response<ResBody>, next: NextFunction) => Promise<any>
): RequestHandler<P, ResBody, ReqBody, ReqQuery> => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// API Routes
app.get('/api/test-connection', asyncHandler(async (req, res) => {
  const request = pool.request();
  await request.query('SELECT 1 as test');
  res.json({ success: true, message: 'Database connection successful!' });
}));

// Todo routes
app.get('/api/todos', asyncHandler(async (req, res) => {
  const result = await pool.request().query('SELECT * FROM TodoItems ORDER BY CreatedDate DESC');
  res.json(result.recordset);
}));

app.post('/api/todos', asyncHandler(async (req, res) => {
  const { title, description, priority, dueDate } = req.body;
  
  const result = await pool.request()
    .input('title', sql.NVarChar, title)
    .input('description', sql.NVarChar, description || null)
    .input('priority', sql.Int, priority || 0)
    .input('dueDate', sql.DateTime, dueDate || null)
    .query(`
      INSERT INTO TodoItems (Title, Description, Priority, DueDate) 
      OUTPUT INSERTED.*
      VALUES (@title, @description, @priority, @dueDate)
    `);
  
  res.status(201).json(result.recordset[0]);
}));

// Update todo status
app.put('/api/todos/:id', asyncHandler<{ id: string }, {}, { isCompleted: boolean }>(async (req, res) => {
  const { id } = req.params;
  const { isCompleted } = req.body;
  
  const result = await pool.request()
    .input('id', sql.Int, id)
    .input('isCompleted', sql.Bit, isCompleted)
    .query(`
      UPDATE TodoItems 
      SET IsCompleted = @isCompleted
      OUTPUT INSERTED.*
      WHERE Id = @id
    `);
  
  if (result.recordset.length === 0) {
    return res.status(404).json({ error: 'Todo not found' });
  }
  
  res.json(result.recordset[0]);
}));

// Delete todo
app.delete('/api/todos/:id', asyncHandler<{ id: string }>(async (req, res) => {
  const { id } = req.params;
  
  const result = await pool.request()
    .input('id', sql.Int, id)
    .query('DELETE FROM TodoItems OUTPUT DELETED.* WHERE Id = @id');
  
  if (result.recordset.length === 0) {
    return res.status(404).json({ error: 'Todo not found' });
  }
  
  res.json({ message: 'Todo deleted successfully' });
}));

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Something went wrong' });
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