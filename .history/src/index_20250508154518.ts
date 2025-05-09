import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import sql, { pool } from 'mssql';

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

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

// API Routes
app.get('/api/test-connection', async (req, res) => {
  try {
    await sql.connect(dbConfig);
    res.json({ success: true, message: 'Database connection successful!' });
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).json({ success: false, message: 'Database connection failed', error: String(error) });
  } finally {
    await pool.close();
  }
});

// Todo routes
app.get('/api/todos', async (req, res) => {
  try {
    const pool = await sql.connect(dbConfig);
    const result = await pool.request().query('SELECT * FROM TodoItems ORDER BY CreatedDate DESC');
    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching todos:', error);
    res.status(500).json({ error: String(error) });
  } finally {
    await pool.close();
  }
});

app.post('/api/todos', async (req, res) => {
  try {
    const { title, description, priority, dueDate } = req.body;
    
    const pool = await sql.connect(dbConfig);
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
  } finally {
    await pool.close();
  }
});

// Update todo status
app.put('/api/todos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { isCompleted } = req.body;
    
    const pool = await sql.connect(dbConfig);
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
  } finally {
    await sql.close();
  }
});

// Delete todo
app.delete('/api/todos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const pool = await sql.connect(dbConfig);
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
  } finally {
    await sql.close();
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});