"use strict";
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
exports.sendEmail = sendEmail;
const nodemailer_1 = __importDefault(require("nodemailer"));
const transporter = nodemailer_1.default.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
    },
});
function sendEmail(to, subject, htmlContent, textContent) {
    return __awaiter(this, void 0, void 0, function* () {
        const recipients = to.map((recipient) => recipient.email).join(', ');
        const mailOptions = {
            from: `"Khushbuwaala" <${process.env.GMAIL_USER}>`,
            to: recipients,
            subject: subject,
            html: htmlContent,
            text: textContent || htmlContent.replace(/<[^>]+>/g, ''),
        };
        try {
            const info = yield transporter.sendMail(mailOptions);
            return info;
        }
        catch (error) {
            console.error('Gmail SMTP Error:', error.message);
            throw new Error('Failed to send email via Gmail');
        }
    });
}
