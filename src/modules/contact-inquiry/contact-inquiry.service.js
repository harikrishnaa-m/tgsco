import { ContactInquiry } from '../../models/contact-inquiry.model.js';

export async function createContactInquiry(data) {
  return ContactInquiry.create(data);
}

export async function listContactInquiries(status) {
  const filter = status ? { status } : {};
  return ContactInquiry.find(filter).sort({ createdAt: -1 }).lean();
}
