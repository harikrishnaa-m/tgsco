import { ContactInquiry } from '../../models/contact-inquiry.model.js';
import { notifyAdmins } from '../notifications/notifications.service.js';

export async function createContactInquiry(data) {
  const inquiry = await ContactInquiry.create(data);
  await notifyAdmins({
    type: 'contact.inquiry_created',
    title: 'New contact inquiry',
    message: `A new inquiry was submitted by ${inquiry.name}.`,
    data: { inquiryId: inquiry._id.toString() },
    eventKey: `contact-inquiry:${inquiry._id}`,
  });
  return inquiry;
}

export async function listContactInquiries(status) {
  const filter = status ? { status } : {};
  return ContactInquiry.find(filter).sort({ createdAt: -1 }).lean();
}
