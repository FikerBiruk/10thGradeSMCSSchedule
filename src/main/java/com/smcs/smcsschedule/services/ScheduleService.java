package com.smcs.smcsschedule.services;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Service;

import com.smcs.smcsschedule.models.Block;

@Service
public class ScheduleService {

	private final Map<String, Block> blocks = new ConcurrentHashMap<>();

	public ScheduleService() {
		seed(new Block(null, "MON", 1, 1, "Bio", "X", "101"));
		seed(new Block(null, "TUE", 2, 2, "CS", "Y", "203"));
		seed(new Block(null, "WED", 3, 1, "ESS", "X", "104"));
	}

	public List<Block> findAll() {
		return new ArrayList<>(blocks.values());
	}

	public Block create(Block request) {
		String id = UUID.randomUUID().toString();
		Block block = new Block(id, request.day, request.periodStart, request.length, request.course, request.group, request.room);
		blocks.put(id, block);
		return block;
	}

	public Block update(String id, Block request) {
		Block existing = blocks.get(id);
		if (existing == null) {
			return null;
		}

		existing.day = request.day;
		existing.periodStart = request.periodStart;
		existing.length = request.length;
		existing.course = request.course;
		existing.group = request.group;
		existing.room = request.room;
		return existing;
	}

	public boolean delete(String id) {
		return blocks.remove(id) != null;
	}

	private void seed(Block block) {
		block.id = UUID.randomUUID().toString();
		blocks.put(block.id, block);
	}
}
