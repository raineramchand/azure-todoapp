import express from 'express';
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

// API Routes
app.get('/api/test-connection', async (req, res) => {
  try {
    // Use the existing pool
    const request = pool.request();
    await request.query('SELECT 1 as test');
    res.json({ success: true, message: 'Database connection successful!' });
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).json({ success: false, message: 'Database connection failed', error: String(error) });
  }
});

// Todo routes
app.get('/api/todos', async (req, res) => {
  try {
    const result = await pool.request().query('SELECT * FROM TodoItems ORDER BY CreatedDate DESC');
    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching todos:', error);
    res.status(500).json({ error: String(error) });
  }
});

app.post('/api/todos', async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Error creating todo:', error);
    res.status(500).json({ error: String(error) });
  }
});

// Update todo status
app.put('/api/todos/:id', async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Error updating todo:', error);
    res.status(500).json({ error: String(error) });
  }
});

// Delete todo
app.delete('/api/todos/:id', async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM TodoItems OUTPUT DELETED.* WHERE Id = @id');
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Todo not found' });
    }
    
    res.json({ message: 'Todo deleted successfully' });
  } catch (error) {
    console.error('Error deleting todo:', error);
    res.status(500).json({ error: String(error) });
  }
});

// Initialize the database pool before starting the server
initializeDbPool().then(() => {
  // Start server
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