package com.smcs.smcsschedule.services;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;

@Service
public class AuthService {

	private static final Map<String, String> TEACHERS = Map.of(
		"charles", "SMCS",
		"hallisey", "SMCS",
		"kingman", "SMCS",
		"bayonet", "SMCS"
	);

	private final Map<String, String> sessionTokens = new HashMap<>();

	public synchronized String login(String username, String password) {
		String expectedPassword = TEACHERS.get(username.toLowerCase());
		
		if (expectedPassword == null || !expectedPassword.equals(password)) {
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
