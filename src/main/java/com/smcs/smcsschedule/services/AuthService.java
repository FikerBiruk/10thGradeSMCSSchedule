package com.smcs.smcsschedule.services;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;

@Service
public class AuthService {
//comment hhahass
	private static final String ADMIN_USERNAME = "charles";
	private static final String ADMIN_PASSWORD = "SMCS";

	private final Map<String, String> sessionTokens = new HashMap<>();

	public synchronized String login(String username, String password) {
		if (!ADMIN_USERNAME.equals(username) || !ADMIN_PASSWORD.equals(password)) {
			return null;
		}

		String token = UUID.randomUUID().toString();
		sessionTokens.put(token, username);
		return token;
	}

	public synchronized boolean isValidToken(String token) {
		return token != null && sessionTokens.containsKey(token);
	}
}
