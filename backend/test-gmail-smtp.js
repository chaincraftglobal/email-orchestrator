import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'dipak.printkartindia@gmail.com',
    pass: 'YOUR_APP_PASSWORD_HERE'  // Replace with actual password
  }
});

const mailOptions = {
  from: 'PrintKart India <dipak.printkartindia@gmail.com>',
  to: 'crmsoftware853@gmail.com',
  subject: 'Test Email',
  text: 'Testing Gmail SMTP connection'
};

transporter.sendMail(mailOptions)
  .then(info => console.log('✅ Email sent:', info.messageId))
  .catch(err => console.error('❌ Error:', err.message));
