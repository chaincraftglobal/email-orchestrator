// cleanup-duplicate-threads.js
// Run this ONCE to clean up duplicate threads
// Usage: node cleanup-duplicate-threads.js

import pool from './config/database.js';

async function cleanupDuplicateThreads() {
  console.log('🧹 Starting duplicate thread cleanup...\n');
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 1. Find all duplicate threads by normalized subject
    const duplicates = await client.query(`
      SELECT 
        LOWER(REGEXP_REPLACE(subject, '^(Re|RE|re|Fwd|FWD|fwd|Fw|FW|fw):\\s*', '', 'gi')) as normalized_subject,
        COUNT(*) as thread_count,
        ARRAY_AGG(id ORDER BY created_at ASC) as thread_ids,
        ARRAY_AGG(subject) as subjects
      FROM email_threads
      GROUP BY LOWER(REGEXP_REPLACE(subject, '^(Re|RE|re|Fwd|FWD|fwd|Fw|FW|fw):\\s*', '', 'gi'))
      HAVING COUNT(*) > 1
    `);
    
    console.log(`📋 Found ${duplicates.rows.length} groups of duplicate threads\n`);
    
    for (const group of duplicates.rows) {
      console.log(`\n🔍 Processing: "${group.normalized_subject}"`);
      console.log(`   Found ${group.thread_count} threads: ${group.thread_ids.join(', ')}`);
      
      const keepId = group.thread_ids[0]; // Keep the first (oldest) thread
      const deleteIds = group.thread_ids.slice(1); // Delete the rest
      
      console.log(`   ✅ Keeping thread ID: ${keepId}`);
      console.log(`   ❌ Deleting thread IDs: ${deleteIds.join(', ')}`);
      
      // Get the merged stats from all threads
      const mergedStats = await client.query(`
        SELECT 
          MAX(last_activity_at) as last_activity,
          MAX(last_inbound_at) as last_inbound,
          MAX(last_outbound_at) as last_outbound,
          SUM(COALESCE(self_reminder_sent_count, 0)) as total_self_reminders,
          SUM(COALESCE(vendor_reminder_sent_count, 0)) as total_vendor_reminders
        FROM email_threads
        WHERE id = ANY($1)
      `, [group.thread_ids]);
      
      const stats = mergedStats.rows[0];
      
      // Update the kept thread with merged info
      await client.query(`
        UPDATE email_threads SET
          last_activity_at = $1,
          last_inbound_at = COALESCE($2, last_inbound_at),
          last_outbound_at = COALESCE($3, last_outbound_at),
          self_reminder_sent_count = LEAST($4, 5),
          vendor_reminder_sent_count = LEAST($5, 3),
          updated_at = NOW()
        WHERE id = $6
      `, [
        stats.last_activity,
        stats.last_inbound,
        stats.last_outbound,
        stats.total_self_reminders,
        stats.total_vendor_reminders,
        keepId
      ]);
      
      // Update emails to point to the kept thread
      for (const deleteId of deleteIds) {
        // Get the gmail_thread_id of the duplicate
        const dupThread = await client.query(
          'SELECT gmail_thread_id FROM email_threads WHERE id = $1',
          [deleteId]
        );
        
        if (dupThread.rows.length > 0) {
          // Update emails with this thread_id to point to the kept thread's gmail_thread_id
          const keptThread = await client.query(
            'SELECT gmail_thread_id FROM email_threads WHERE id = $1',
            [keepId]
          );
          
          // We don't update email thread_ids since they're Gmail's IDs
          // Just delete the duplicate thread record
        }
      }
      
      // Delete duplicate threads
      await client.query(
        'DELETE FROM email_threads WHERE id = ANY($1)',
        [deleteIds]
      );
      
      console.log(`   ✅ Deleted ${deleteIds.length} duplicate threads`);
    }
    
    await client.query('COMMIT');
    
    console.log('\n\n✅ Cleanup complete!');
    
    // Show final state
    const finalCount = await client.query('SELECT COUNT(*) FROM email_threads');
    console.log(`📊 Total threads remaining: ${finalCount.rows[0].count}`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error during cleanup:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run cleanup
cleanupDuplicateThreads()
  .then(() => {
    console.log('\n🎉 Done!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Failed:', err);
    process.exit(1);
  });